use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::{
            instruction::Instruction, program_pack::Pack, system_instruction, system_program,
        },
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    anchor_spl::{
        associated_token::{self, get_associated_token_address, spl_associated_token_account},
        token::spl_token,
    },
    betting_engine::{Bet, LpPosition, Pool},
    litesvm::{types::TransactionMetadata, LiteSVM},
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

const USDC_DECIMALS: u8 = 6;
const MATCH_ID: &str = "match_1";

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

struct TestEnv {
    svm: LiteSVM,
    authority: Keypair,
    usdc_mint: Pubkey,
}

fn setup() -> TestEnv {
    let mut svm = LiteSVM::new();

    // Load oracle-adapter program
    let oracle_bytes = include_bytes!(concat!(
        env!("CARGO_TARGET_TMPDIR"),
        "/../deploy/oracle_adapter.so"
    ));
    svm.add_program(oracle_adapter::id(), oracle_bytes).unwrap();

    // Load betting-engine program
    let betting_bytes = include_bytes!(concat!(
        env!("CARGO_TARGET_TMPDIR"),
        "/../deploy/betting_engine.so"
    ));
    svm.add_program(betting_engine::id(), betting_bytes)
        .unwrap();

    let authority = Keypair::new();
    svm.airdrop(&authority.pubkey(), 10_000_000_000).unwrap();

    // Create USDC mint owned by the authority
    let usdc_mint = create_mint(&mut svm, &authority, &authority.pubkey(), USDC_DECIMALS);

    TestEnv {
        svm,
        authority,
        usdc_mint,
    }
}

// ---------------------------------------------------------------------------
// Pool helpers
// ---------------------------------------------------------------------------

fn pool_pda(match_id: &str) -> Pubkey {
    Pubkey::find_program_address(&[b"pool", match_id.as_bytes()], &betting_engine::id()).0
}

fn pool_vault_authority(match_id: &str) -> Pubkey {
    Pubkey::find_program_address(&[b"vault", match_id.as_bytes()], &betting_engine::id()).0
}

fn lp_position_pda(pool: &Pubkey, owner: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[b"lp", pool.as_ref(), owner.as_ref()],
        &betting_engine::id(),
    )
    .0
}

fn build_create_pool_ix(
    authority: &Pubkey,
    mint: &Pubkey,
    match_id: &str,
    fee_rate: u16,
) -> Instruction {
    let pool = pool_pda(match_id);
    let vault_authority = pool_vault_authority(match_id);
    let vault = get_associated_token_address(&vault_authority, mint);

    Instruction::new_with_bytes(
        betting_engine::id(),
        &betting_engine::instruction::CreatePool {
            match_id: match_id.to_string(),
            fee_rate,
        }
        .data(),
        betting_engine::accounts::CreatePool {
            authority: *authority,
            pool,
            mint: *mint,
            vault_authority,
            vault,
            token_program: spl_token::ID,
            associated_token_program: associated_token::ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

fn build_deposit_ix(owner: &Pubkey, mint: &Pubkey, match_id: &str, amount: u64) -> Instruction {
    let pool = pool_pda(match_id);
    let lp_position = lp_position_pda(&pool, owner);
    let vault = get_associated_token_address(&pool_vault_authority(match_id), mint);
    let owner_token_account = get_associated_token_address(owner, mint);

    Instruction::new_with_bytes(
        betting_engine::id(),
        &betting_engine::instruction::Deposit { amount }.data(),
        betting_engine::accounts::Deposit {
            owner: *owner,
            pool,
            lp_position,
            mint: *mint,
            vault,
            owner_token_account,
            token_program: spl_token::ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

fn build_claim_fees_ix(owner: &Pubkey, mint: &Pubkey, match_id: &str) -> Instruction {
    let pool = pool_pda(match_id);
    let lp_position = lp_position_pda(&pool, owner);
    let vault_authority = pool_vault_authority(match_id);
    let vault = get_associated_token_address(&vault_authority, mint);
    let owner_token_account = get_associated_token_address(owner, mint);

    Instruction::new_with_bytes(
        betting_engine::id(),
        &betting_engine::instruction::ClaimFees {}.data(),
        betting_engine::accounts::ClaimFees {
            owner: *owner,
            pool,
            lp_position,
            mint: *mint,
            vault_authority,
            vault,
            owner_token_account,
            token_program: spl_token::ID,
        }
        .to_account_metas(None),
    )
}

fn build_withdraw_ix(owner: &Pubkey, mint: &Pubkey, match_id: &str, shares: u64) -> Instruction {
    let pool = pool_pda(match_id);
    let lp_position = lp_position_pda(&pool, owner);
    let vault_authority = pool_vault_authority(match_id);
    let vault = get_associated_token_address(&vault_authority, mint);
    let owner_token_account = get_associated_token_address(owner, mint);

    Instruction::new_with_bytes(
        betting_engine::id(),
        &betting_engine::instruction::Withdraw { shares }.data(),
        betting_engine::accounts::Withdraw {
            owner: *owner,
            pool,
            lp_position,
            mint: *mint,
            vault_authority,
            vault,
            owner_token_account,
            token_program: spl_token::ID,
        }
        .to_account_metas(None),
    )
}

fn read_pool(svm: &LiteSVM, match_id: &str) -> Pool {
    let pool = pool_pda(match_id);
    let account = svm.get_account(&pool).unwrap();
    Pool::try_deserialize(&mut account.data.as_slice()).unwrap()
}

fn read_lp_position(svm: &LiteSVM, pool: &Pubkey, owner: &Pubkey) -> LpPosition {
    let lp_position = lp_position_pda(pool, owner);
    let account = svm.get_account(&lp_position).unwrap();
    LpPosition::try_deserialize(&mut account.data.as_slice()).unwrap()
}

fn setup_pool_with_liquidity(env: &mut TestEnv, amount: u64) {
    let lp = Keypair::new();
    env.svm.airdrop(&lp.pubkey(), 10_000_000_000).unwrap();
    let lp_ata = create_ata(&mut env.svm, &env.authority, &lp.pubkey(), &env.usdc_mint);
    mint_to(
        &mut env.svm,
        &env.authority,
        &env.usdc_mint,
        &lp_ata,
        &env.authority,
        amount,
    );

    send_tx(
        &mut env.svm,
        build_create_pool_ix(&env.authority.pubkey(), &env.usdc_mint, MATCH_ID, 200),
        &env.authority,
    )
    .unwrap();
    send_tx(
        &mut env.svm,
        build_deposit_ix(&lp.pubkey(), &env.usdc_mint, MATCH_ID, amount),
        &lp,
    )
    .unwrap();
}

fn create_mint(
    svm: &mut LiteSVM,
    payer: &Keypair,
    mint_authority: &Pubkey,
    decimals: u8,
) -> Pubkey {
    let mint = Keypair::new();
    let rent = svm.minimum_balance_for_rent_exemption(spl_token::state::Mint::LEN);

    let create_account_ix = system_instruction::create_account(
        &payer.pubkey(),
        &mint.pubkey(),
        rent,
        spl_token::state::Mint::LEN as u64,
        &spl_token::ID,
    );

    let init_mint_ix = spl_token::instruction::initialize_mint(
        &spl_token::ID,
        &mint.pubkey(),
        mint_authority,
        None,
        decimals,
    )
    .unwrap();

    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(
        &[create_account_ix, init_mint_ix],
        Some(&payer.pubkey()),
        &blockhash,
    );
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[payer, &mint]).unwrap();
    svm.send_transaction(tx).unwrap();

    mint.pubkey()
}

fn create_ata(svm: &mut LiteSVM, payer: &Keypair, owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    let ix = spl_associated_token_account::instruction::create_associated_token_account(
        &payer.pubkey(),
        owner,
        mint,
        &spl_token::ID,
    );
    send_tx(svm, ix, payer).unwrap();
    get_associated_token_address(owner, mint)
}

fn mint_to(
    svm: &mut LiteSVM,
    _payer: &Keypair,
    mint: &Pubkey,
    dest: &Pubkey,
    mint_authority: &Keypair,
    amount: u64,
) {
    let ix = spl_token::instruction::mint_to(
        &spl_token::ID,
        mint,
        dest,
        &mint_authority.pubkey(),
        &[],
        amount,
    )
    .unwrap();
    send_tx(svm, ix, mint_authority).unwrap();
}

fn send_tx(svm: &mut LiteSVM, ix: Instruction, signer: &Keypair) -> Result<(), String> {
    send_tx_with_metadata(svm, ix, signer)
        .map(|_| ())
        .map_err(|e| format!("{e:?}"))
}

fn send_tx_with_metadata(
    svm: &mut LiteSVM,
    ix: Instruction,
    signer: &Keypair,
) -> Result<TransactionMetadata, String> {
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&signer.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[signer]).unwrap();
    svm.send_transaction(tx).map_err(|e| format!("{e:?}"))
}

fn anchor_event_payload(logs: &[String], discriminator: &[u8]) -> Vec<u8> {
    logs.iter()
        .filter_map(|log| log.strip_prefix("Program data: "))
        .filter_map(|encoded| {
            use base64::{engine::general_purpose::STANDARD, Engine as _};
            STANDARD.decode(encoded).ok()
        })
        .find(|data| data.starts_with(discriminator))
        .expect("expected Anchor event payload in program logs")
}

fn get_token_balance(svm: &LiteSVM, token_account: &Pubkey) -> u64 {
    let account = svm.get_account(token_account).unwrap();
    let token_data = spl_token::state::Account::unpack(&account.data).unwrap();
    token_data.amount
}

// ---------------------------------------------------------------------------
// Oracle helper: create a match with odds
// ---------------------------------------------------------------------------

fn create_oracle_match(
    svm: &mut LiteSVM,
    authority: &Keypair,
    match_id: &str,
    odds_home: u16,
    odds_away: u16,
    odds_draw: u16,
) {
    let program_id = oracle_adapter::id();
    let match_account =
        Pubkey::find_program_address(&[b"match", match_id.as_bytes()], &program_id).0;

    let ix = Instruction::new_with_bytes(
        program_id,
        &oracle_adapter::instruction::UpdateOdds {
            match_id: match_id.to_string(),
            odds_home,
            odds_away,
            odds_draw,
            tag: String::new(),
        }
        .data(),
        oracle_adapter::accounts::UpdateOdds {
            authority: authority.pubkey(),
            match_account,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    send_tx(svm, ix, authority).unwrap();
}

// ---------------------------------------------------------------------------
// Betting instruction builders
// ---------------------------------------------------------------------------

fn build_place_bet_ix(
    user: &Keypair,
    match_id: &str,
    usdc_mint: &Pubkey,
    direction: u8,
    window_secs: u32,
    amount: u64,
    nonce: u32,
) -> Instruction {
    let program_id = betting_engine::id();
    let oracle_program_id = oracle_adapter::id();

    let bet_pda = Pubkey::find_program_address(
        &[
            b"bet",
            match_id.as_bytes(),
            user.pubkey().as_ref(),
            &nonce.to_le_bytes(),
        ],
        &program_id,
    )
    .0;

    let match_account =
        Pubkey::find_program_address(&[b"match", match_id.as_bytes()], &oracle_program_id).0;

    let pool = pool_pda(match_id);
    let vault_authority = pool_vault_authority(match_id);

    let vault_token_account = get_associated_token_address(&vault_authority, usdc_mint);
    let user_token_account = get_associated_token_address(&user.pubkey(), usdc_mint);

    Instruction::new_with_bytes(
        program_id,
        &betting_engine::instruction::PlaceBet {
            direction,
            window_secs,
            amount,
            nonce,
        }
        .data(),
        betting_engine::accounts::PlaceBet {
            user: user.pubkey(),
            user_token_account,
            vault: vault_token_account,
            vault_authority,
            pool,
            match_account,
            bet: bet_pda,
            mint: *usdc_mint,
            token_program: spl_token::ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

fn build_settle_bet_ix(
    authority: &Keypair,
    user: &Pubkey,
    match_id: &str,
    usdc_mint: &Pubkey,
    nonce: u32,
    odds_at_expiry_home: u16,
) -> Instruction {
    let program_id = betting_engine::id();

    let bet_pda = Pubkey::find_program_address(
        &[
            b"bet",
            match_id.as_bytes(),
            user.as_ref(),
            &nonce.to_le_bytes(),
        ],
        &program_id,
    )
    .0;

    let pool = pool_pda(match_id);
    let vault_authority = pool_vault_authority(match_id);

    let vault_token_account = get_associated_token_address(&vault_authority, usdc_mint);
    let user_token_account = get_associated_token_address(user, usdc_mint);

    Instruction::new_with_bytes(
        program_id,
        &betting_engine::instruction::SettleBet {
            odds_at_expiry_home,
        }
        .data(),
        betting_engine::accounts::SettleBet {
            authority: authority.pubkey(),
            bet: bet_pda,
            pool,
            vault: vault_token_account,
            vault_authority,
            user_token_account,
            mint: *usdc_mint,
            token_program: spl_token::ID,
        }
        .to_account_metas(None),
    )
}

fn get_bet_account(svm: &LiteSVM, match_id: &str, user: &Pubkey, nonce: u32) -> Bet {
    let program_id = betting_engine::id();
    let bet_pda = Pubkey::find_program_address(
        &[
            b"bet",
            match_id.as_bytes(),
            user.as_ref(),
            &nonce.to_le_bytes(),
        ],
        &program_id,
    )
    .0;

    let account = svm.get_account(&bet_pda).unwrap();
    let mut data: &[u8] = &account.data;
    Bet::try_deserialize(&mut data).unwrap()
}

fn set_clock(svm: &mut LiteSVM, unix_timestamp: i64) {
    use anchor_lang::solana_program::clock::Clock;
    let clock = Clock {
        unix_timestamp,
        ..Clock::default()
    };
    svm.set_sysvar(&clock);
}

// ===========================================================================
// place_bet tests
// ===========================================================================

#[test]
fn test_place_bet_up_success() {
    let mut env = setup();
    let user = Keypair::new();
    let amount = 100_000_000; // 100 USDC
    let nonce = 0u32;

    // Create oracle match with odds
    create_oracle_match(&mut env.svm, &env.authority, MATCH_ID, 6500, 3000, 500);
    setup_pool_with_liquidity(&mut env, 10_000_000_000);

    // Fund user
    env.svm.airdrop(&user.pubkey(), 10_000_000_000).unwrap();
    let user_ata = create_ata(&mut env.svm, &user, &user.pubkey(), &env.usdc_mint);
    mint_to(
        &mut env.svm,
        &env.authority,
        &env.usdc_mint,
        &user_ata,
        &env.authority,
        amount,
    );

    // Place UP bet
    let ix = build_place_bet_ix(&user, MATCH_ID, &env.usdc_mint, 0, 60, amount, nonce);
    let res = send_tx(&mut env.svm, ix, &user);
    assert!(res.is_ok(), "Failed to place bet: {:?}", res.err());

    // Verify Bet PDA
    let bet = get_bet_account(&env.svm, MATCH_ID, &user.pubkey(), nonce);
    assert_eq!(bet.user, user.pubkey());
    assert_eq!(bet.match_id, MATCH_ID);
    assert_eq!(bet.direction, 0); // Up
    assert_eq!(bet.amount, amount);
    assert_eq!(bet.payout, 176_400_000); // 98 USDC effective * 1.8
    assert_eq!(bet.status, 0); // Open
    assert_eq!(bet.odds_at_entry, 6500);
    assert_eq!(bet.window_secs, 60);
    assert_eq!(bet.nonce, nonce);

    // Verify USDC transferred from user
    assert_eq!(get_token_balance(&env.svm, &user_ata), 0);

    let pool = read_pool(&env.svm, MATCH_ID);
    let vault = get_associated_token_address(&pool_vault_authority(MATCH_ID), &env.usdc_mint);
    assert_eq!(get_token_balance(&env.svm, &vault), 10_100_000_000);
    assert_eq!(pool.total_liquidity, 10_100_000_000);
    assert_eq!(pool.locked_liquidity, 176_400_000);
    assert_eq!(pool.protocol_fees_accumulated, 500_000);
}

#[test]
fn test_place_bet_down_success() {
    let mut env = setup();
    let user = Keypair::new();
    let amount = 50_000_000; // 50 USDC
    let nonce = 0u32;

    create_oracle_match(&mut env.svm, &env.authority, MATCH_ID, 6500, 3000, 500);
    setup_pool_with_liquidity(&mut env, 10_000_000_000);

    env.svm.airdrop(&user.pubkey(), 10_000_000_000).unwrap();
    let user_ata = create_ata(&mut env.svm, &user, &user.pubkey(), &env.usdc_mint);
    mint_to(
        &mut env.svm,
        &env.authority,
        &env.usdc_mint,
        &user_ata,
        &env.authority,
        amount,
    );

    // Place DOWN bet
    let ix = build_place_bet_ix(&user, MATCH_ID, &env.usdc_mint, 1, 300, amount, nonce);
    let res = send_tx(&mut env.svm, ix, &user);
    assert!(res.is_ok(), "Failed to place bet: {:?}", res.err());

    let bet = get_bet_account(&env.svm, MATCH_ID, &user.pubkey(), nonce);
    assert_eq!(bet.direction, 1); // Down
    assert_eq!(bet.amount, amount);
    assert_eq!(bet.payout, 88_200_000); // 49 USDC effective * 1.8
    assert_eq!(bet.window_secs, 300);
}

#[test]
fn test_reject_invalid_window() {
    let mut env = setup();
    let user = Keypair::new();
    let amount = 100_000_000;
    let nonce = 0u32;

    create_oracle_match(&mut env.svm, &env.authority, MATCH_ID, 6500, 3000, 500);
    setup_pool_with_liquidity(&mut env, 10_000_000_000);

    env.svm.airdrop(&user.pubkey(), 10_000_000_000).unwrap();
    let user_ata = create_ata(&mut env.svm, &user, &user.pubkey(), &env.usdc_mint);
    mint_to(
        &mut env.svm,
        &env.authority,
        &env.usdc_mint,
        &user_ata,
        &env.authority,
        amount,
    );

    // window_secs=120 is not in [60,300,600,900]
    let ix = build_place_bet_ix(&user, MATCH_ID, &env.usdc_mint, 0, 120, amount, nonce);
    let res = send_tx(&mut env.svm, ix, &user);
    assert!(
        res.is_err(),
        "Expected InvalidWindow error but tx succeeded"
    );
}

#[test]
fn test_reject_bet_too_small() {
    let mut env = setup();
    let user = Keypair::new();
    let amount = 500_000; // 0.5 USDC — below 1 USDC minimum
    let nonce = 0u32;

    create_oracle_match(&mut env.svm, &env.authority, MATCH_ID, 6500, 3000, 500);
    setup_pool_with_liquidity(&mut env, 10_000_000_000);

    env.svm.airdrop(&user.pubkey(), 10_000_000_000).unwrap();
    let user_ata = create_ata(&mut env.svm, &user, &user.pubkey(), &env.usdc_mint);
    mint_to(
        &mut env.svm,
        &env.authority,
        &env.usdc_mint,
        &user_ata,
        &env.authority,
        amount,
    );

    let ix = build_place_bet_ix(&user, MATCH_ID, &env.usdc_mint, 0, 60, amount, nonce);
    let res = send_tx(&mut env.svm, ix, &user);
    assert!(res.is_err(), "Expected BetTooSmall error but tx succeeded");
}

#[test]
fn test_reject_insufficient_funds() {
    let mut env = setup();
    let user = Keypair::new();
    let amount = 100_000_000; // 100 USDC but user has 0
    let nonce = 0u32;

    create_oracle_match(&mut env.svm, &env.authority, MATCH_ID, 6500, 3000, 500);
    setup_pool_with_liquidity(&mut env, 10_000_000_000);

    env.svm.airdrop(&user.pubkey(), 10_000_000_000).unwrap();
    // Create ATA but do NOT mint any USDC
    let _user_ata = create_ata(&mut env.svm, &user, &user.pubkey(), &env.usdc_mint);

    let ix = build_place_bet_ix(&user, MATCH_ID, &env.usdc_mint, 0, 60, amount, nonce);
    let res = send_tx(&mut env.svm, ix, &user);
    assert!(
        res.is_err(),
        "Expected insufficient funds error but tx succeeded"
    );
}

#[test]
fn test_reject_pool_without_enough_liquidity() {
    let mut env = setup();
    let user = Keypair::new();
    let amount = 100_000_000; // payout is 176.4 USDC after fee
    let nonce = 0u32;

    create_oracle_match(&mut env.svm, &env.authority, MATCH_ID, 6500, 3000, 500);
    setup_pool_with_liquidity(&mut env, 100_000_000); // only 100 USDC available

    env.svm.airdrop(&user.pubkey(), 10_000_000_000).unwrap();
    let user_ata = create_ata(&mut env.svm, &user, &user.pubkey(), &env.usdc_mint);
    mint_to(
        &mut env.svm,
        &env.authority,
        &env.usdc_mint,
        &user_ata,
        &env.authority,
        amount,
    );

    let ix = build_place_bet_ix(&user, MATCH_ID, &env.usdc_mint, 0, 60, amount, nonce);
    let res = send_tx(&mut env.svm, ix, &user);

    assert!(
        res.is_err(),
        "Expected InsufficientLiquidity error but tx succeeded"
    );
}

// ===========================================================================
// LP withdraw/fees tests
// ===========================================================================

#[test]
fn test_withdraw_unlocked_liquidity() {
    let mut env = setup();
    let lp = Keypair::new();
    let deposit_amount = 10_000_000_000;
    let withdraw_shares = 5_000_000_000;

    env.svm.airdrop(&lp.pubkey(), 10_000_000_000).unwrap();
    let lp_ata = create_ata(&mut env.svm, &env.authority, &lp.pubkey(), &env.usdc_mint);
    mint_to(
        &mut env.svm,
        &env.authority,
        &env.usdc_mint,
        &lp_ata,
        &env.authority,
        deposit_amount,
    );
    send_tx(
        &mut env.svm,
        build_create_pool_ix(&env.authority.pubkey(), &env.usdc_mint, MATCH_ID, 200),
        &env.authority,
    )
    .unwrap();
    send_tx(
        &mut env.svm,
        build_deposit_ix(&lp.pubkey(), &env.usdc_mint, MATCH_ID, deposit_amount),
        &lp,
    )
    .unwrap();

    let ix = build_withdraw_ix(&lp.pubkey(), &env.usdc_mint, MATCH_ID, withdraw_shares);
    let res = send_tx(&mut env.svm, ix, &lp);
    assert!(res.is_ok(), "Failed to withdraw: {:?}", res.err());

    let pool_key = pool_pda(MATCH_ID);
    let pool = read_pool(&env.svm, MATCH_ID);
    let position = read_lp_position(&env.svm, &pool_key, &lp.pubkey());

    assert_eq!(get_token_balance(&env.svm, &lp_ata), withdraw_shares);
    assert_eq!(pool.total_liquidity, 5_000_000_000);
    assert_eq!(pool.total_shares, 5_000_000_000);
    assert_eq!(position.shares, 5_000_000_000);
}

#[test]
fn test_claim_fees_after_bet() {
    let mut env = setup();
    let lp = Keypair::new();
    let user = Keypair::new();
    let deposit_amount = 10_000_000_000;
    let bet_amount = 100_000_000;
    let nonce = 0u32;

    create_oracle_match(&mut env.svm, &env.authority, MATCH_ID, 6500, 3000, 500);
    env.svm.airdrop(&lp.pubkey(), 10_000_000_000).unwrap();
    env.svm.airdrop(&user.pubkey(), 10_000_000_000).unwrap();
    let lp_ata = create_ata(&mut env.svm, &env.authority, &lp.pubkey(), &env.usdc_mint);
    let user_ata = create_ata(&mut env.svm, &user, &user.pubkey(), &env.usdc_mint);
    mint_to(
        &mut env.svm,
        &env.authority,
        &env.usdc_mint,
        &lp_ata,
        &env.authority,
        deposit_amount,
    );
    mint_to(
        &mut env.svm,
        &env.authority,
        &env.usdc_mint,
        &user_ata,
        &env.authority,
        bet_amount,
    );
    send_tx(
        &mut env.svm,
        build_create_pool_ix(&env.authority.pubkey(), &env.usdc_mint, MATCH_ID, 200),
        &env.authority,
    )
    .unwrap();
    send_tx(
        &mut env.svm,
        build_deposit_ix(&lp.pubkey(), &env.usdc_mint, MATCH_ID, deposit_amount),
        &lp,
    )
    .unwrap();
    send_tx(
        &mut env.svm,
        build_place_bet_ix(&user, MATCH_ID, &env.usdc_mint, 0, 60, bet_amount, nonce),
        &user,
    )
    .unwrap();

    let ix = build_claim_fees_ix(&lp.pubkey(), &env.usdc_mint, MATCH_ID);
    let res = send_tx(&mut env.svm, ix, &lp);
    assert!(res.is_ok(), "Failed to claim fees: {:?}", res.err());

    let pool_key = pool_pda(MATCH_ID);
    let pool = read_pool(&env.svm, MATCH_ID);
    let position = read_lp_position(&env.svm, &pool_key, &lp.pubkey());

    assert_eq!(get_token_balance(&env.svm, &lp_ata), 1_500_000);
    assert_eq!(pool.protocol_fees_accumulated, 500_000);
    assert_eq!(position.fees_claimed_per_share, pool.fees_per_share);
}

#[test]
fn test_reject_withdraw_when_liquidity_locked() {
    let mut env = setup();
    let lp = Keypair::new();
    let user = Keypair::new();
    let deposit_amount = 10_000_000_000;
    let bet_amount = 5_000_000_000;
    let nonce = 0u32;

    create_oracle_match(&mut env.svm, &env.authority, MATCH_ID, 6500, 3000, 500);
    env.svm.airdrop(&lp.pubkey(), 10_000_000_000).unwrap();
    env.svm.airdrop(&user.pubkey(), 10_000_000_000).unwrap();
    let lp_ata = create_ata(&mut env.svm, &env.authority, &lp.pubkey(), &env.usdc_mint);
    let user_ata = create_ata(&mut env.svm, &user, &user.pubkey(), &env.usdc_mint);
    mint_to(
        &mut env.svm,
        &env.authority,
        &env.usdc_mint,
        &lp_ata,
        &env.authority,
        deposit_amount,
    );
    mint_to(
        &mut env.svm,
        &env.authority,
        &env.usdc_mint,
        &user_ata,
        &env.authority,
        bet_amount,
    );
    send_tx(
        &mut env.svm,
        build_create_pool_ix(&env.authority.pubkey(), &env.usdc_mint, MATCH_ID, 200),
        &env.authority,
    )
    .unwrap();
    send_tx(
        &mut env.svm,
        build_deposit_ix(&lp.pubkey(), &env.usdc_mint, MATCH_ID, deposit_amount),
        &lp,
    )
    .unwrap();
    send_tx(
        &mut env.svm,
        build_place_bet_ix(&user, MATCH_ID, &env.usdc_mint, 0, 60, bet_amount, nonce),
        &user,
    )
    .unwrap();

    let ix = build_withdraw_ix(&lp.pubkey(), &env.usdc_mint, MATCH_ID, deposit_amount);
    let res = send_tx(&mut env.svm, ix, &lp);
    let pool = read_pool(&env.svm, MATCH_ID);

    assert!(
        res.is_err(),
        "Expected InsufficientLiquidity error but tx succeeded"
    );
    assert!(pool.locked_liquidity > 0);
}

// ===========================================================================
// settle_bet tests
// ===========================================================================

/// Helper: set up a placed bet and return the user keypair, ready for settlement.
fn setup_placed_bet(
    env: &mut TestEnv,
    direction: u8,
    amount: u64,
    odds_home: u16,
    window_secs: u32,
) -> Keypair {
    let user = Keypair::new();
    let nonce = 0u32;

    create_oracle_match(
        &mut env.svm,
        &env.authority,
        MATCH_ID,
        odds_home,
        3000,
        10000 - odds_home - 3000,
    );
    setup_pool_with_liquidity(env, 10_000_000_000);

    env.svm.airdrop(&user.pubkey(), 10_000_000_000).unwrap();
    let user_ata = create_ata(&mut env.svm, &user, &user.pubkey(), &env.usdc_mint);
    mint_to(
        &mut env.svm,
        &env.authority,
        &env.usdc_mint,
        &user_ata,
        &env.authority,
        amount,
    );

    let ix = build_place_bet_ix(
        &user,
        MATCH_ID,
        &env.usdc_mint,
        direction,
        window_secs,
        amount,
        nonce,
    );
    send_tx(&mut env.svm, ix, &user).unwrap();

    user
}

#[test]
fn test_settle_up_wins() {
    let mut env = setup();
    let amount = 100_000_000; // 100 USDC
    let payout = 176_400_000; // 98 USDC effective * 1.8
    let nonce = 0u32;

    let user = setup_placed_bet(&mut env, 0, amount, 6500, 60); // direction=Up

    // Advance clock past expiry
    let bet = get_bet_account(&env.svm, MATCH_ID, &user.pubkey(), nonce);
    set_clock(&mut env.svm, bet.expires_at + 1);

    // Settle: odds went UP (6700 > 6500) -> Up wins
    let ix = build_settle_bet_ix(
        &env.authority,
        &user.pubkey(),
        MATCH_ID,
        &env.usdc_mint,
        nonce,
        6700,
    );
    let res = send_tx(&mut env.svm, ix, &env.authority);
    assert!(res.is_ok(), "Failed to settle bet: {:?}", res.err());

    // Verify bet status = Won
    let bet = get_bet_account(&env.svm, MATCH_ID, &user.pubkey(), nonce);
    assert_eq!(bet.status, 1); // Won

    // Verify user received payout
    let user_ata = get_associated_token_address(&user.pubkey(), &env.usdc_mint);
    assert_eq!(get_token_balance(&env.svm, &user_ata), payout);
}

#[test]
fn test_settle_up_loses() {
    let mut env = setup();
    let amount = 100_000_000;
    let nonce = 0u32;

    let user = setup_placed_bet(&mut env, 0, amount, 6500, 60); // direction=Up

    let bet = get_bet_account(&env.svm, MATCH_ID, &user.pubkey(), nonce);
    set_clock(&mut env.svm, bet.expires_at + 1);

    // Settle: odds went DOWN (6300 < 6500) -> Up loses
    let ix = build_settle_bet_ix(
        &env.authority,
        &user.pubkey(),
        MATCH_ID,
        &env.usdc_mint,
        nonce,
        6300,
    );
    let res = send_tx(&mut env.svm, ix, &env.authority);
    assert!(res.is_ok(), "Failed to settle bet: {:?}", res.err());

    let bet = get_bet_account(&env.svm, MATCH_ID, &user.pubkey(), nonce);
    assert_eq!(bet.status, 2); // Lost

    // User should NOT have received payout (balance stays 0)
    let user_ata = get_associated_token_address(&user.pubkey(), &env.usdc_mint);
    assert_eq!(get_token_balance(&env.svm, &user_ata), 0);
}

#[test]
fn test_settle_down_wins() {
    let mut env = setup();
    let amount = 100_000_000;
    let payout = 176_400_000; // 98 USDC effective * 1.8
    let nonce = 0u32;

    let user = setup_placed_bet(&mut env, 1, amount, 6500, 60); // direction=Down

    let bet = get_bet_account(&env.svm, MATCH_ID, &user.pubkey(), nonce);
    set_clock(&mut env.svm, bet.expires_at + 1);

    // Settle: odds went DOWN (6300 < 6500) -> Down wins
    let ix = build_settle_bet_ix(
        &env.authority,
        &user.pubkey(),
        MATCH_ID,
        &env.usdc_mint,
        nonce,
        6300,
    );
    let res = send_tx(&mut env.svm, ix, &env.authority);
    assert!(res.is_ok(), "Failed to settle bet: {:?}", res.err());

    let bet = get_bet_account(&env.svm, MATCH_ID, &user.pubkey(), nonce);
    assert_eq!(bet.status, 1); // Won

    let user_ata = get_associated_token_address(&user.pubkey(), &env.usdc_mint);
    assert_eq!(get_token_balance(&env.svm, &user_ata), payout);
}

#[test]
fn test_settle_down_loses() {
    let mut env = setup();
    let amount = 100_000_000;
    let nonce = 0u32;

    let user = setup_placed_bet(&mut env, 1, amount, 6500, 60); // direction=Down

    let bet = get_bet_account(&env.svm, MATCH_ID, &user.pubkey(), nonce);
    set_clock(&mut env.svm, bet.expires_at + 1);

    // Settle: odds went UP (6700 > 6500) -> Down loses
    let ix = build_settle_bet_ix(
        &env.authority,
        &user.pubkey(),
        MATCH_ID,
        &env.usdc_mint,
        nonce,
        6700,
    );
    let res = send_tx(&mut env.svm, ix, &env.authority);
    assert!(res.is_ok(), "Failed to settle bet: {:?}", res.err());

    let bet = get_bet_account(&env.svm, MATCH_ID, &user.pubkey(), nonce);
    assert_eq!(bet.status, 2); // Lost

    let user_ata = get_associated_token_address(&user.pubkey(), &env.usdc_mint);
    assert_eq!(get_token_balance(&env.svm, &user_ata), 0);
}

#[test]
fn test_reject_settle_before_expiry() {
    let mut env = setup();
    let amount = 100_000_000;
    let nonce = 0u32;

    let user = setup_placed_bet(&mut env, 0, amount, 6500, 60);

    // Do NOT advance clock — bet has not expired yet
    let bet = get_bet_account(&env.svm, MATCH_ID, &user.pubkey(), nonce);
    // Set clock to BEFORE expires_at
    set_clock(&mut env.svm, bet.created_at + 1);

    let ix = build_settle_bet_ix(
        &env.authority,
        &user.pubkey(),
        MATCH_ID,
        &env.usdc_mint,
        nonce,
        6700,
    );
    let res = send_tx(&mut env.svm, ix, &env.authority);
    assert!(
        res.is_err(),
        "Expected BetNotExpired error but tx succeeded"
    );
}

#[test]
fn test_reject_settle_already_settled() {
    let mut env = setup();
    let amount = 100_000_000;
    let nonce = 0u32;

    let user = setup_placed_bet(&mut env, 0, amount, 6500, 60);

    let bet = get_bet_account(&env.svm, MATCH_ID, &user.pubkey(), nonce);
    set_clock(&mut env.svm, bet.expires_at + 1);

    // First settle — should succeed
    let ix = build_settle_bet_ix(
        &env.authority,
        &user.pubkey(),
        MATCH_ID,
        &env.usdc_mint,
        nonce,
        6700,
    );
    let res = send_tx(&mut env.svm, ix, &env.authority);
    assert!(res.is_ok(), "First settle failed: {:?}", res.err());

    // Second settle — should fail
    let ix = build_settle_bet_ix(
        &env.authority,
        &user.pubkey(),
        MATCH_ID,
        &env.usdc_mint,
        nonce,
        6300,
    );
    let res = send_tx(&mut env.svm, ix, &env.authority);
    assert!(
        res.is_err(),
        "Expected BetAlreadySettled error but tx succeeded"
    );
}

#[test]
fn test_reject_unauthorized_settler() {
    let mut env = setup();
    let amount = 100_000_000;
    let nonce = 0u32;

    let user = setup_placed_bet(&mut env, 0, amount, 6500, 60);

    let bet = get_bet_account(&env.svm, MATCH_ID, &user.pubkey(), nonce);
    set_clock(&mut env.svm, bet.expires_at + 1);

    // Random wallet tries to settle
    let random_signer = Keypair::new();
    env.svm
        .airdrop(&random_signer.pubkey(), 10_000_000_000)
        .unwrap();

    let ix = build_settle_bet_ix(
        &random_signer,
        &user.pubkey(),
        MATCH_ID,
        &env.usdc_mint,
        nonce,
        6700,
    );
    let res = send_tx(&mut env.svm, ix, &random_signer);
    assert!(res.is_err(), "Expected Unauthorized error but tx succeeded");
}

#[test]
fn test_settle_bet_emits_bet_settled_event() {
    let mut env = setup();
    let amount = 100_000_000;
    let nonce = 0u32;
    let user = setup_placed_bet(&mut env, 0, amount, 6500, 60);

    let bet = get_bet_account(&env.svm, MATCH_ID, &user.pubkey(), nonce);
    set_clock(&mut env.svm, bet.expires_at + 1);

    let ix = build_settle_bet_ix(
        &env.authority,
        &user.pubkey(),
        MATCH_ID,
        &env.usdc_mint,
        nonce,
        6700,
    );
    let meta =
        send_tx_with_metadata(&mut env.svm, ix, &env.authority).expect("settle_bet should succeed");

    let payload = anchor_event_payload(&meta.logs, &[57, 145, 224, 160, 62, 119, 227, 206]);
    let mut offset = 8;

    assert_eq!(
        Pubkey::new_from_array(payload[offset..offset + 32].try_into().unwrap()),
        env.authority.pubkey()
    );
    offset += 32;
    assert_eq!(
        Pubkey::new_from_array(payload[offset..offset + 32].try_into().unwrap()),
        user.pubkey()
    );
    offset += 32;

    let match_id_len = u32::from_le_bytes(payload[offset..offset + 4].try_into().unwrap()) as usize;
    offset += 4;
    assert_eq!(
        std::str::from_utf8(&payload[offset..offset + match_id_len]).unwrap(),
        MATCH_ID
    );
    offset += match_id_len;

    assert_eq!(
        Pubkey::new_from_array(payload[offset..offset + 32].try_into().unwrap()),
        Pubkey::find_program_address(
            &[
                b"bet",
                MATCH_ID.as_bytes(),
                user.pubkey().as_ref(),
                &nonce.to_le_bytes(),
            ],
            &betting_engine::id(),
        )
        .0
    );
    offset += 32;
    assert_eq!(payload[offset], 0);
    offset += 1;
    assert_eq!(
        u16::from_le_bytes(payload[offset..offset + 2].try_into().unwrap()),
        6500
    );
    offset += 2;
    assert_eq!(
        u16::from_le_bytes(payload[offset..offset + 2].try_into().unwrap()),
        6700
    );
    offset += 2;
    assert_eq!(payload[offset], 1);
    offset += 1;
    assert_eq!(payload[offset], 1);
    offset += 1;
    assert!(i64::from_le_bytes(payload[offset..offset + 8].try_into().unwrap()) > 0);
}
