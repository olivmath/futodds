use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::{
            instruction::Instruction, program_pack::Pack, system_instruction, system_program,
        },
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    anchor_spl::{
        associated_token::{get_associated_token_address, spl_associated_token_account},
        token::spl_token,
    },
    liquidity_pool::{LpPosition, Pool},
    litesvm::LiteSVM,
    oracle_adapter::{MATCH_STATUS_LIVE, MATCH_STATUS_SETTLED},
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

const USDC_DECIMALS: u8 = 6;
const MATCH_ID: &str = "match_1";
const FEE_RATE: u16 = 200; // 2%

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

    let oracle_bytes = include_bytes!(concat!(
        env!("CARGO_TARGET_TMPDIR"),
        "/../deploy/oracle_adapter.so"
    ));
    svm.add_program(oracle_adapter::id(), oracle_bytes).unwrap();

    let pool_bytes = include_bytes!(concat!(
        env!("CARGO_TARGET_TMPDIR"),
        "/../deploy/liquidity_pool.so"
    ));
    svm.add_program(liquidity_pool::id(), pool_bytes).unwrap();

    let authority = Keypair::new();
    svm.airdrop(&authority.pubkey(), 10_000_000_000).unwrap();

    let usdc_mint = create_mint(&mut svm, &authority, &authority.pubkey(), USDC_DECIMALS);

    TestEnv {
        svm,
        authority,
        usdc_mint,
    }
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

fn mint_to(svm: &mut LiteSVM, mint: &Pubkey, dest: &Pubkey, mint_authority: &Keypair, amount: u64) {
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
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&signer.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[signer]).unwrap();
    svm.send_transaction(tx)
        .map(|_| ())
        .map_err(|e| format!("{e:?}"))
}

fn get_token_balance(svm: &LiteSVM, token_account: &Pubkey) -> u64 {
    let account = svm.get_account(token_account).unwrap();
    let token_data = spl_token::state::Account::unpack(&account.data).unwrap();
    token_data.amount
}

// ---------------------------------------------------------------------------
// Oracle helpers
// ---------------------------------------------------------------------------

fn oracle_match_pda(match_id: &str) -> Pubkey {
    Pubkey::find_program_address(&[b"match", match_id.as_bytes()], &oracle_adapter::id()).0
}

fn create_match(svm: &mut LiteSVM, authority: &Keypair, match_id: &str) {
    let ix = Instruction::new_with_bytes(
        oracle_adapter::id(),
        &oracle_adapter::instruction::UpdateOdds {
            match_id: match_id.to_string(),
            odds_home: 6500,
            odds_away: 3000,
            odds_draw: 500,
        }
        .data(),
        oracle_adapter::accounts::UpdateOdds {
            authority: authority.pubkey(),
            match_account: oracle_match_pda(match_id),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    send_tx(svm, ix, authority).unwrap();
}

fn set_match_status(svm: &mut LiteSVM, authority: &Keypair, match_id: &str, status: u8) {
    let ix = Instruction::new_with_bytes(
        oracle_adapter::id(),
        &oracle_adapter::instruction::SetMatchStatus { new_status: status }.data(),
        oracle_adapter::accounts::MutateMatch {
            authority: authority.pubkey(),
            match_account: oracle_match_pda(match_id),
        }
        .to_account_metas(None),
    );
    send_tx(svm, ix, authority).unwrap();
}

// ---------------------------------------------------------------------------
// Pool instruction builders
// ---------------------------------------------------------------------------

fn pool_pda(match_id: &str) -> Pubkey {
    Pubkey::find_program_address(&[b"pool", match_id.as_bytes()], &liquidity_pool::id()).0
}

fn vault_pda(match_id: &str) -> Pubkey {
    Pubkey::find_program_address(&[b"vault", match_id.as_bytes()], &liquidity_pool::id()).0
}

fn lp_position_pda(match_id: &str, owner: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[b"lp", pool_pda(match_id).as_ref(), owner.as_ref()],
        &liquidity_pool::id(),
    )
    .0
}

fn build_create_pool_ix(
    payer: &Keypair,
    match_id: &str,
    usdc_mint: &Pubkey,
    fee_rate: u16,
) -> Instruction {
    Instruction::new_with_bytes(
        liquidity_pool::id(),
        &liquidity_pool::instruction::CreatePool {
            match_id: match_id.to_string(),
            fee_rate,
        }
        .data(),
        liquidity_pool::accounts::CreatePool {
            payer: payer.pubkey(),
            match_account: oracle_match_pda(match_id),
            pool: pool_pda(match_id),
            mint: *usdc_mint,
            vault: vault_pda(match_id),
            token_program: spl_token::ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

fn build_deposit_ix(
    owner: &Keypair,
    match_id: &str,
    usdc_mint: &Pubkey,
    amount: u64,
) -> Instruction {
    Instruction::new_with_bytes(
        liquidity_pool::id(),
        &liquidity_pool::instruction::Deposit { amount }.data(),
        liquidity_pool::accounts::Deposit {
            owner: owner.pubkey(),
            pool: pool_pda(match_id),
            match_account: oracle_match_pda(match_id),
            lp_position: lp_position_pda(match_id, &owner.pubkey()),
            vault: vault_pda(match_id),
            owner_token_account: get_associated_token_address(&owner.pubkey(), usdc_mint),
            token_program: spl_token::ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

fn get_pool(svm: &LiteSVM, match_id: &str) -> Pool {
    let account = svm.get_account(&pool_pda(match_id)).unwrap();
    let mut data: &[u8] = &account.data;
    Pool::try_deserialize(&mut data).unwrap()
}

fn get_lp_position(svm: &LiteSVM, match_id: &str, owner: &Pubkey) -> LpPosition {
    let account = svm.get_account(&lp_position_pda(match_id, owner)).unwrap();
    let mut data: &[u8] = &account.data;
    LpPosition::try_deserialize(&mut data).unwrap()
}

/// Fund an LP wallet with USDC and return it with its ATA.
fn fund_lp(env: &mut TestEnv, amount: u64) -> (Keypair, Pubkey) {
    let lp = Keypair::new();
    env.svm.airdrop(&lp.pubkey(), 10_000_000_000).unwrap();
    let ata = create_ata(&mut env.svm, &lp, &lp.pubkey(), &env.usdc_mint);
    if amount > 0 {
        let authority = env.authority.insecure_clone();
        mint_to(&mut env.svm, &env.usdc_mint, &ata, &authority, amount);
    }
    (lp, ata)
}

/// Create the match + pool, ready for deposits.
fn setup_pool(env: &mut TestEnv) {
    let authority = env.authority.insecure_clone();
    create_match(&mut env.svm, &authority, MATCH_ID);
    let ix = build_create_pool_ix(&authority, MATCH_ID, &env.usdc_mint, FEE_RATE);
    send_tx(&mut env.svm, ix, &authority).unwrap();
}

// ===========================================================================
// create_pool tests
// ===========================================================================

#[test]
fn test_create_pool_success() {
    let mut env = setup();
    setup_pool(&mut env);

    let pool = get_pool(&env.svm, MATCH_ID);
    assert_eq!(pool.match_id, MATCH_ID);
    assert_eq!(pool.authority, env.authority.pubkey());
    assert_eq!(pool.vault, vault_pda(MATCH_ID));
    assert_eq!(pool.fee_rate, FEE_RATE);
    assert_eq!(pool.total_liquidity, 0);
    assert_eq!(pool.locked_liquidity, 0);
    assert_eq!(pool.total_shares, 0);

    // Vault exists, holds nothing, and is owned by the pool PDA
    assert_eq!(get_token_balance(&env.svm, &vault_pda(MATCH_ID)), 0);
}

#[test]
fn test_reject_create_pool_without_match() {
    let mut env = setup();
    // No oracle match created for this id
    let authority = env.authority.insecure_clone();
    let ix = build_create_pool_ix(&authority, "ghost_match", &env.usdc_mint, FEE_RATE);
    let res = send_tx(&mut env.svm, ix, &authority);
    assert!(
        res.is_err(),
        "Expected missing match error but tx succeeded"
    );
}

#[test]
fn test_reject_create_pool_invalid_fee_rate() {
    let mut env = setup();
    let authority = env.authority.insecure_clone();
    create_match(&mut env.svm, &authority, MATCH_ID);

    let ix = build_create_pool_ix(&authority, MATCH_ID, &env.usdc_mint, 1_001);
    let res = send_tx(&mut env.svm, ix, &authority);
    assert!(
        res.is_err(),
        "Expected InvalidFeeRate error but tx succeeded"
    );
}

#[test]
fn test_reject_create_pool_on_settled_match() {
    let mut env = setup();
    let authority = env.authority.insecure_clone();
    create_match(&mut env.svm, &authority, MATCH_ID);
    set_match_status(&mut env.svm, &authority, MATCH_ID, MATCH_STATUS_SETTLED);

    let ix = build_create_pool_ix(&authority, MATCH_ID, &env.usdc_mint, FEE_RATE);
    let res = send_tx(&mut env.svm, ix, &authority);
    assert!(
        res.is_err(),
        "Expected MatchAlreadySettled error but tx succeeded"
    );
}

// ===========================================================================
// deposit tests
// ===========================================================================

#[test]
fn test_first_deposit_mints_shares_one_to_one() {
    let mut env = setup();
    setup_pool(&mut env);

    let amount = 10_000_000_000; // 10,000 USDC
    let (lp, lp_ata) = fund_lp(&mut env, amount);

    let ix = build_deposit_ix(&lp, MATCH_ID, &env.usdc_mint, amount);
    let res = send_tx(&mut env.svm, ix, &lp);
    assert!(res.is_ok(), "Failed to deposit: {:?}", res.err());

    let pool = get_pool(&env.svm, MATCH_ID);
    assert_eq!(pool.total_liquidity, amount);
    assert_eq!(pool.total_shares, amount); // 1:1 on first deposit

    let position = get_lp_position(&env.svm, MATCH_ID, &lp.pubkey());
    assert_eq!(position.owner, lp.pubkey());
    assert_eq!(position.pool, pool_pda(MATCH_ID));
    assert_eq!(position.shares, amount);

    assert_eq!(get_token_balance(&env.svm, &vault_pda(MATCH_ID)), amount);
    assert_eq!(get_token_balance(&env.svm, &lp_ata), 0);
}

#[test]
fn test_second_deposit_from_another_lp_is_pro_rata() {
    let mut env = setup();
    setup_pool(&mut env);

    let first_amount = 10_000_000_000; // 10,000 USDC
    let (lp_a, _) = fund_lp(&mut env, first_amount);
    let ix = build_deposit_ix(&lp_a, MATCH_ID, &env.usdc_mint, first_amount);
    send_tx(&mut env.svm, ix, &lp_a).unwrap();

    let second_amount = 5_000_000_000; // 5,000 USDC
    let (lp_b, _) = fund_lp(&mut env, second_amount);
    let ix = build_deposit_ix(&lp_b, MATCH_ID, &env.usdc_mint, second_amount);
    let res = send_tx(&mut env.svm, ix, &lp_b);
    assert!(res.is_ok(), "Failed second deposit: {:?}", res.err());

    let pool = get_pool(&env.svm, MATCH_ID);
    assert_eq!(pool.total_liquidity, 15_000_000_000);
    assert_eq!(pool.total_shares, 15_000_000_000); // ratio still 1:1, no fees yet

    let position_b = get_lp_position(&env.svm, MATCH_ID, &lp_b.pubkey());
    assert_eq!(position_b.shares, second_amount);

    assert_eq!(
        get_token_balance(&env.svm, &vault_pda(MATCH_ID)),
        15_000_000_000
    );
}

#[test]
fn test_repeat_deposit_same_lp_accumulates_shares() {
    let mut env = setup();
    setup_pool(&mut env);

    let (lp, _) = fund_lp(&mut env, 3_000_000_000);

    let ix = build_deposit_ix(&lp, MATCH_ID, &env.usdc_mint, 1_000_000_000);
    send_tx(&mut env.svm, ix, &lp).unwrap();
    let ix = build_deposit_ix(&lp, MATCH_ID, &env.usdc_mint, 2_000_000_000);
    let res = send_tx(&mut env.svm, ix, &lp);
    assert!(res.is_ok(), "Failed repeat deposit: {:?}", res.err());

    let position = get_lp_position(&env.svm, MATCH_ID, &lp.pubkey());
    assert_eq!(position.shares, 3_000_000_000);

    let pool = get_pool(&env.svm, MATCH_ID);
    assert_eq!(pool.total_liquidity, 3_000_000_000);
    assert_eq!(pool.total_shares, 3_000_000_000);
}

#[test]
fn test_reject_deposit_on_settled_match() {
    let mut env = setup();
    setup_pool(&mut env);

    let (lp, _) = fund_lp(&mut env, 1_000_000_000);
    let authority = env.authority.insecure_clone();
    set_match_status(&mut env.svm, &authority, MATCH_ID, MATCH_STATUS_SETTLED);

    let ix = build_deposit_ix(&lp, MATCH_ID, &env.usdc_mint, 1_000_000_000);
    let res = send_tx(&mut env.svm, ix, &lp);
    assert!(
        res.is_err(),
        "Expected MatchAlreadySettled error but tx succeeded"
    );
}

#[test]
fn test_deposit_allowed_while_live() {
    let mut env = setup();
    setup_pool(&mut env);

    let (lp, _) = fund_lp(&mut env, 1_000_000_000);
    let authority = env.authority.insecure_clone();
    set_match_status(&mut env.svm, &authority, MATCH_ID, MATCH_STATUS_LIVE);

    let ix = build_deposit_ix(&lp, MATCH_ID, &env.usdc_mint, 1_000_000_000);
    let res = send_tx(&mut env.svm, ix, &lp);
    assert!(
        res.is_ok(),
        "Deposit during live match should succeed: {:?}",
        res.err()
    );
}

#[test]
fn test_reject_deposit_below_minimum() {
    let mut env = setup();
    setup_pool(&mut env);

    let (lp, _) = fund_lp(&mut env, 1_000_000);

    // 0.5 USDC — below the 1 USDC minimum
    let ix = build_deposit_ix(&lp, MATCH_ID, &env.usdc_mint, 500_000);
    let res = send_tx(&mut env.svm, ix, &lp);
    assert!(
        res.is_err(),
        "Expected DepositTooSmall error but tx succeeded"
    );
}

#[test]
fn test_reject_deposit_with_insufficient_funds() {
    let mut env = setup();
    setup_pool(&mut env);

    let (lp, _) = fund_lp(&mut env, 0);

    let ix = build_deposit_ix(&lp, MATCH_ID, &env.usdc_mint, 1_000_000_000);
    let res = send_tx(&mut env.svm, ix, &lp);
    assert!(
        res.is_err(),
        "Expected insufficient funds error but tx succeeded"
    );
}
