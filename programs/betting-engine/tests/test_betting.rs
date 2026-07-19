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
    betting_engine::Bet,
    litesvm::LiteSVM,
    oracle_adapter::MATCH_STATUS_LIVE,
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

    let oracle_bytes = include_bytes!(concat!(
        env!("CARGO_TARGET_TMPDIR"),
        "/../deploy/oracle_adapter.so"
    ));
    svm.add_program(oracle_adapter::id(), oracle_bytes).unwrap();

    let betting_bytes = include_bytes!(concat!(
        env!("CARGO_TARGET_TMPDIR"),
        "/../deploy/betting_engine.so"
    ));
    svm.add_program(betting_engine::id(), betting_bytes)
        .unwrap();

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

fn set_clock(svm: &mut LiteSVM, unix_timestamp: i64) {
    use anchor_lang::solana_program::clock::Clock;
    let clock = Clock {
        unix_timestamp,
        ..Clock::default()
    };
    svm.set_sysvar(&clock);
}

// ---------------------------------------------------------------------------
// Oracle helpers
// ---------------------------------------------------------------------------

fn oracle_match_pda(match_id: &str) -> Pubkey {
    Pubkey::find_program_address(&[b"match", match_id.as_bytes()], &oracle_adapter::id()).0
}

fn update_oracle_odds(
    svm: &mut LiteSVM,
    authority: &Keypair,
    match_id: &str,
    odds_home: u16,
    odds_away: u16,
    odds_draw: u16,
) {
    let ix = Instruction::new_with_bytes(
        oracle_adapter::id(),
        &oracle_adapter::instruction::UpdateOdds {
            match_id: match_id.to_string(),
            odds_home,
            odds_away,
            odds_draw,
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

/// Create a match with odds and flip it to Live so bets are accepted.
fn create_live_match(
    svm: &mut LiteSVM,
    authority: &Keypair,
    match_id: &str,
    odds_home: u16,
    odds_away: u16,
    odds_draw: u16,
) {
    update_oracle_odds(svm, authority, match_id, odds_home, odds_away, odds_draw);
    set_match_status(svm, authority, match_id, MATCH_STATUS_LIVE);
}

// ---------------------------------------------------------------------------
// Betting instruction builders
// ---------------------------------------------------------------------------

fn bet_pda(match_id: &str, user: &Pubkey, nonce: u32) -> Pubkey {
    Pubkey::find_program_address(
        &[
            b"bet",
            match_id.as_bytes(),
            user.as_ref(),
            &nonce.to_le_bytes(),
        ],
        &betting_engine::id(),
    )
    .0
}

fn vault_authority_pda(match_id: &str) -> Pubkey {
    Pubkey::find_program_address(&[b"escrow", match_id.as_bytes()], &betting_engine::id()).0
}

#[allow(clippy::too_many_arguments)]
fn build_place_bet_ix(
    user: &Keypair,
    match_id: &str,
    usdc_mint: &Pubkey,
    direction: u8,
    selection: u8,
    window_secs: u32,
    amount: u64,
    nonce: u32,
) -> Instruction {
    let vault_authority = vault_authority_pda(match_id);

    Instruction::new_with_bytes(
        betting_engine::id(),
        &betting_engine::instruction::PlaceBet {
            direction,
            selection,
            window_secs,
            amount,
            nonce,
        }
        .data(),
        betting_engine::accounts::PlaceBet {
            user: user.pubkey(),
            user_token_account: get_associated_token_address(&user.pubkey(), usdc_mint),
            vault: get_associated_token_address(&vault_authority, usdc_mint),
            vault_authority,
            match_account: oracle_match_pda(match_id),
            bet: bet_pda(match_id, &user.pubkey(), nonce),
            mint: *usdc_mint,
            token_program: spl_token::ID,
            associated_token_program: associated_token::ID,
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
) -> Instruction {
    let vault_authority = vault_authority_pda(match_id);

    Instruction::new_with_bytes(
        betting_engine::id(),
        &betting_engine::instruction::SettleBet {}.data(),
        betting_engine::accounts::SettleBet {
            authority: authority.pubkey(),
            bet: bet_pda(match_id, user, nonce),
            match_account: oracle_match_pda(match_id),
            vault: get_associated_token_address(&vault_authority, usdc_mint),
            vault_authority,
            user_token_account: get_associated_token_address(user, usdc_mint),
            mint: *usdc_mint,
            token_program: spl_token::ID,
        }
        .to_account_metas(None),
    )
}

fn build_close_bet_ix(user: &Keypair, match_id: &str, nonce: u32) -> Instruction {
    Instruction::new_with_bytes(
        betting_engine::id(),
        &betting_engine::instruction::CloseBet {}.data(),
        betting_engine::accounts::CloseBet {
            user: user.pubkey(),
            bet: bet_pda(match_id, &user.pubkey(), nonce),
        }
        .to_account_metas(None),
    )
}

fn get_bet_account(svm: &LiteSVM, match_id: &str, user: &Pubkey, nonce: u32) -> Bet {
    let account = svm.get_account(&bet_pda(match_id, user, nonce)).unwrap();
    let mut data: &[u8] = &account.data;
    Bet::try_deserialize(&mut data).unwrap()
}

/// Fund a user with USDC and return its keypair + ATA.
fn fund_user(env: &mut TestEnv, amount: u64) -> (Keypair, Pubkey) {
    let user = Keypair::new();
    env.svm.airdrop(&user.pubkey(), 10_000_000_000).unwrap();
    let user_ata = create_ata(&mut env.svm, &user, &user.pubkey(), &env.usdc_mint);
    if amount > 0 {
        let authority = env.authority.insecure_clone();
        mint_to(&mut env.svm, &env.usdc_mint, &user_ata, &authority, amount);
    }
    (user, user_ata)
}

// ===========================================================================
// place_bet tests
// ===========================================================================

#[test]
fn test_place_bet_up_success() {
    let mut env = setup();
    let amount = 100_000_000; // 100 USDC (max allowed)
    let nonce = 0u32;

    create_live_match(
        &mut env.svm,
        &env.authority.insecure_clone(),
        MATCH_ID,
        6500,
        3000,
        500,
    );
    let (user, user_ata) = fund_user(&mut env, amount);

    let ix = build_place_bet_ix(&user, MATCH_ID, &env.usdc_mint, 0, 0, 60, amount, nonce);
    let res = send_tx(&mut env.svm, ix, &user);
    assert!(res.is_ok(), "Failed to place bet: {:?}", res.err());

    let bet = get_bet_account(&env.svm, MATCH_ID, &user.pubkey(), nonce);
    assert_eq!(bet.user, user.pubkey());
    assert_eq!(bet.match_id, MATCH_ID);
    assert_eq!(bet.direction, 0); // Up
    assert_eq!(bet.selection, 0); // Home
    assert_eq!(bet.amount, amount);
    assert_eq!(bet.payout, amount * 18 / 10);
    assert_eq!(bet.status, 0); // Open
    assert_eq!(bet.odds_at_entry, 6500);
    assert_eq!(bet.odds_at_expiry, 0);
    assert_eq!(bet.window_secs, 60);
    assert_eq!(bet.nonce, nonce);

    assert_eq!(get_token_balance(&env.svm, &user_ata), 0);
}

#[test]
fn test_place_bet_down_on_away_selection() {
    let mut env = setup();
    let amount = 50_000_000; // 50 USDC
    let nonce = 0u32;

    create_live_match(
        &mut env.svm,
        &env.authority.insecure_clone(),
        MATCH_ID,
        6500,
        3000,
        500,
    );
    let (user, _) = fund_user(&mut env, amount);

    // DOWN on the away selection: entry odds must come from odds_away
    let ix = build_place_bet_ix(&user, MATCH_ID, &env.usdc_mint, 1, 1, 300, amount, nonce);
    let res = send_tx(&mut env.svm, ix, &user);
    assert!(res.is_ok(), "Failed to place bet: {:?}", res.err());

    let bet = get_bet_account(&env.svm, MATCH_ID, &user.pubkey(), nonce);
    assert_eq!(bet.direction, 1); // Down
    assert_eq!(bet.selection, 1); // Away
    assert_eq!(bet.odds_at_entry, 3000);
    assert_eq!(bet.window_secs, 300);
}

#[test]
fn test_place_bet_accepts_20_minute_window() {
    let mut env = setup();
    let amount = 10_000_000;
    let nonce = 0u32;

    create_live_match(
        &mut env.svm,
        &env.authority.insecure_clone(),
        MATCH_ID,
        6500,
        3000,
        500,
    );
    let (user, _) = fund_user(&mut env, amount);

    let ix = build_place_bet_ix(&user, MATCH_ID, &env.usdc_mint, 0, 0, 1200, amount, nonce);
    let res = send_tx(&mut env.svm, ix, &user);
    assert!(res.is_ok(), "1200s window should be valid: {:?}", res.err());
}

#[test]
fn test_reject_invalid_window() {
    let mut env = setup();
    let amount = 10_000_000;
    let nonce = 0u32;

    create_live_match(
        &mut env.svm,
        &env.authority.insecure_clone(),
        MATCH_ID,
        6500,
        3000,
        500,
    );
    let (user, _) = fund_user(&mut env, amount);

    // 900s (15 min) was removed from the window set — PRD says 1/5/10/20 min
    let ix = build_place_bet_ix(&user, MATCH_ID, &env.usdc_mint, 0, 0, 900, amount, nonce);
    let res = send_tx(&mut env.svm, ix, &user);
    assert!(
        res.is_err(),
        "Expected InvalidWindow error but tx succeeded"
    );
}

#[test]
fn test_reject_invalid_selection() {
    let mut env = setup();
    let amount = 10_000_000;
    let nonce = 0u32;

    create_live_match(
        &mut env.svm,
        &env.authority.insecure_clone(),
        MATCH_ID,
        6500,
        3000,
        500,
    );
    let (user, _) = fund_user(&mut env, amount);

    let ix = build_place_bet_ix(&user, MATCH_ID, &env.usdc_mint, 0, 3, 60, amount, nonce);
    let res = send_tx(&mut env.svm, ix, &user);
    assert!(
        res.is_err(),
        "Expected InvalidSelection error but tx succeeded"
    );
}

#[test]
fn test_reject_bet_too_small() {
    let mut env = setup();
    let amount = 500_000; // 0.5 USDC — below 1 USDC minimum
    let nonce = 0u32;

    create_live_match(
        &mut env.svm,
        &env.authority.insecure_clone(),
        MATCH_ID,
        6500,
        3000,
        500,
    );
    let (user, _) = fund_user(&mut env, amount);

    let ix = build_place_bet_ix(&user, MATCH_ID, &env.usdc_mint, 0, 0, 60, amount, nonce);
    let res = send_tx(&mut env.svm, ix, &user);
    assert!(res.is_err(), "Expected BetTooSmall error but tx succeeded");
}

#[test]
fn test_reject_bet_too_large() {
    let mut env = setup();
    let amount = 100_000_001; // just above the 100 USDC maximum
    let nonce = 0u32;

    create_live_match(
        &mut env.svm,
        &env.authority.insecure_clone(),
        MATCH_ID,
        6500,
        3000,
        500,
    );
    let (user, _) = fund_user(&mut env, amount);

    let ix = build_place_bet_ix(&user, MATCH_ID, &env.usdc_mint, 0, 0, 60, amount, nonce);
    let res = send_tx(&mut env.svm, ix, &user);
    assert!(res.is_err(), "Expected BetTooLarge error but tx succeeded");
}

#[test]
fn test_reject_bet_on_non_live_match() {
    let mut env = setup();
    let amount = 10_000_000;
    let nonce = 0u32;

    // Match created but never flipped to Live (status = Upcoming)
    let authority = env.authority.insecure_clone();
    update_oracle_odds(&mut env.svm, &authority, MATCH_ID, 6500, 3000, 500);
    let (user, _) = fund_user(&mut env, amount);

    let ix = build_place_bet_ix(&user, MATCH_ID, &env.usdc_mint, 0, 0, 60, amount, nonce);
    let res = send_tx(&mut env.svm, ix, &user);
    assert!(res.is_err(), "Expected MatchNotLive error but tx succeeded");
}

#[test]
fn test_reject_insufficient_funds() {
    let mut env = setup();
    let amount = 100_000_000; // 100 USDC but user has 0
    let nonce = 0u32;

    create_live_match(
        &mut env.svm,
        &env.authority.insecure_clone(),
        MATCH_ID,
        6500,
        3000,
        500,
    );
    let (user, _) = fund_user(&mut env, 0);

    let ix = build_place_bet_ix(&user, MATCH_ID, &env.usdc_mint, 0, 0, 60, amount, nonce);
    let res = send_tx(&mut env.svm, ix, &user);
    assert!(
        res.is_err(),
        "Expected insufficient funds error but tx succeeded"
    );
}

// ===========================================================================
// settle_bet tests
// ===========================================================================

/// Set up a live match, fund the vault, place a bet, and return the user.
fn setup_placed_bet(
    env: &mut TestEnv,
    direction: u8,
    selection: u8,
    amount: u64,
    odds_home: u16,
    window_secs: u32,
) -> Keypair {
    let nonce = 0u32;
    let authority = env.authority.insecure_clone();

    create_live_match(
        &mut env.svm,
        &authority,
        MATCH_ID,
        odds_home,
        3000,
        10000 - odds_home - 3000,
    );

    let (user, _) = fund_user(env, amount);

    // Fund the vault so it can cover payouts beyond the escrowed stake
    let vault_ata = create_ata(
        &mut env.svm,
        &authority,
        &vault_authority_pda(MATCH_ID),
        &env.usdc_mint,
    );
    let payout = amount * 18 / 10;
    mint_to(&mut env.svm, &env.usdc_mint, &vault_ata, &authority, payout);

    let ix = build_place_bet_ix(
        &user,
        MATCH_ID,
        &env.usdc_mint,
        direction,
        selection,
        window_secs,
        amount,
        nonce,
    );
    send_tx(&mut env.svm, ix, &user).unwrap();

    user
}

/// Advance the clock past expiry and push a fresh oracle snapshot so the
/// settlement reads `odds_at_expiry` from the Match PDA.
fn expire_with_odds(env: &mut TestEnv, user: &Pubkey, odds_home: u16) {
    let bet = get_bet_account(&env.svm, MATCH_ID, user, 0);
    set_clock(&mut env.svm, bet.expires_at + 1);
    let authority = env.authority.insecure_clone();
    // Away differs from the creation snapshot (3000) so the update tx is never
    // byte-identical to the creation tx (litesvm rejects duplicate txs).
    update_oracle_odds(
        &mut env.svm,
        &authority,
        MATCH_ID,
        odds_home,
        2900,
        10000 - odds_home - 2900,
    );
}

#[test]
fn test_settle_up_wins() {
    let mut env = setup();
    let amount = 100_000_000; // 100 USDC
    let payout = amount * 18 / 10; // 180 USDC
    let nonce = 0u32;

    let user = setup_placed_bet(&mut env, 0, 0, amount, 6500, 60); // Up on Home
    expire_with_odds(&mut env, &user.pubkey(), 6700); // odds went UP -> Up wins

    let ix = build_settle_bet_ix(
        &env.authority,
        &user.pubkey(),
        MATCH_ID,
        &env.usdc_mint,
        nonce,
    );
    let res = send_tx(&mut env.svm, ix, &env.authority);
    assert!(res.is_ok(), "Failed to settle bet: {:?}", res.err());

    let bet = get_bet_account(&env.svm, MATCH_ID, &user.pubkey(), nonce);
    assert_eq!(bet.status, 1); // Won
    assert_eq!(bet.odds_at_expiry, 6700); // snapshot recorded on-chain

    let user_ata = get_associated_token_address(&user.pubkey(), &env.usdc_mint);
    assert_eq!(get_token_balance(&env.svm, &user_ata), payout);
}

#[test]
fn test_settle_up_loses() {
    let mut env = setup();
    let amount = 100_000_000;
    let nonce = 0u32;

    let user = setup_placed_bet(&mut env, 0, 0, amount, 6500, 60); // Up on Home
    expire_with_odds(&mut env, &user.pubkey(), 6300); // odds went DOWN -> Up loses

    let ix = build_settle_bet_ix(
        &env.authority,
        &user.pubkey(),
        MATCH_ID,
        &env.usdc_mint,
        nonce,
    );
    let res = send_tx(&mut env.svm, ix, &env.authority);
    assert!(res.is_ok(), "Failed to settle bet: {:?}", res.err());

    let bet = get_bet_account(&env.svm, MATCH_ID, &user.pubkey(), nonce);
    assert_eq!(bet.status, 2); // Lost
    assert_eq!(bet.odds_at_expiry, 6300);

    let user_ata = get_associated_token_address(&user.pubkey(), &env.usdc_mint);
    assert_eq!(get_token_balance(&env.svm, &user_ata), 0);
}

#[test]
fn test_settle_down_wins() {
    let mut env = setup();
    let amount = 100_000_000;
    let payout = amount * 18 / 10;
    let nonce = 0u32;

    let user = setup_placed_bet(&mut env, 1, 0, amount, 6500, 60); // Down on Home
    expire_with_odds(&mut env, &user.pubkey(), 6300); // odds went DOWN -> Down wins

    let ix = build_settle_bet_ix(
        &env.authority,
        &user.pubkey(),
        MATCH_ID,
        &env.usdc_mint,
        nonce,
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

    let user = setup_placed_bet(&mut env, 1, 0, amount, 6500, 60); // Down on Home
    expire_with_odds(&mut env, &user.pubkey(), 6700); // odds went UP -> Down loses

    let ix = build_settle_bet_ix(
        &env.authority,
        &user.pubkey(),
        MATCH_ID,
        &env.usdc_mint,
        nonce,
    );
    let res = send_tx(&mut env.svm, ix, &env.authority);
    assert!(res.is_ok(), "Failed to settle bet: {:?}", res.err());

    let bet = get_bet_account(&env.svm, MATCH_ID, &user.pubkey(), nonce);
    assert_eq!(bet.status, 2); // Lost

    let user_ata = get_associated_token_address(&user.pubkey(), &env.usdc_mint);
    assert_eq!(get_token_balance(&env.svm, &user_ata), 0);
}

#[test]
fn test_settle_tie_refunds_stake() {
    let mut env = setup();
    let amount = 100_000_000; // 100 USDC
    let nonce = 0u32;

    let user = setup_placed_bet(&mut env, 0, 0, amount, 6500, 60);
    expire_with_odds(&mut env, &user.pubkey(), 6500); // unchanged -> tie

    let ix = build_settle_bet_ix(
        &env.authority,
        &user.pubkey(),
        MATCH_ID,
        &env.usdc_mint,
        nonce,
    );
    let res = send_tx(&mut env.svm, ix, &env.authority);
    assert!(res.is_ok(), "Failed to settle tie: {:?}", res.err());

    let bet = get_bet_account(&env.svm, MATCH_ID, &user.pubkey(), nonce);
    assert_eq!(bet.status, 3); // Refunded
    assert_eq!(bet.odds_at_expiry, 6500);

    // Stake returned (full refund until the pool fee lands in fase 2b)
    let user_ata = get_associated_token_address(&user.pubkey(), &env.usdc_mint);
    assert_eq!(get_token_balance(&env.svm, &user_ata), amount);
}

#[test]
fn test_settle_away_selection_uses_away_odds() {
    let mut env = setup();
    let amount = 100_000_000;
    let payout = amount * 18 / 10;
    let nonce = 0u32;

    // Up on Away: entry odds_away = 3000
    let user = setup_placed_bet(&mut env, 0, 1, amount, 6500, 60);

    // Home unchanged, away moves 3000 -> 3200 (draw absorbs the difference)
    let bet = get_bet_account(&env.svm, MATCH_ID, &user.pubkey(), nonce);
    set_clock(&mut env.svm, bet.expires_at + 1);
    let authority = env.authority.insecure_clone();
    update_oracle_odds(&mut env.svm, &authority, MATCH_ID, 6500, 3200, 300);

    let ix = build_settle_bet_ix(
        &env.authority,
        &user.pubkey(),
        MATCH_ID,
        &env.usdc_mint,
        nonce,
    );
    let res = send_tx(&mut env.svm, ix, &env.authority);
    assert!(res.is_ok(), "Failed to settle bet: {:?}", res.err());

    let bet = get_bet_account(&env.svm, MATCH_ID, &user.pubkey(), nonce);
    assert_eq!(bet.status, 1); // Won: 3200 > 3000
    assert_eq!(bet.odds_at_entry, 3000);
    assert_eq!(bet.odds_at_expiry, 3200);

    let user_ata = get_associated_token_address(&user.pubkey(), &env.usdc_mint);
    assert_eq!(get_token_balance(&env.svm, &user_ata), payout);
}

#[test]
fn test_reject_settle_before_expiry() {
    let mut env = setup();
    let amount = 100_000_000;
    let nonce = 0u32;

    let user = setup_placed_bet(&mut env, 0, 0, amount, 6500, 60);

    let bet = get_bet_account(&env.svm, MATCH_ID, &user.pubkey(), nonce);
    set_clock(&mut env.svm, bet.created_at + 1); // before expiry

    let ix = build_settle_bet_ix(
        &env.authority,
        &user.pubkey(),
        MATCH_ID,
        &env.usdc_mint,
        nonce,
    );
    let res = send_tx(&mut env.svm, ix, &env.authority);
    assert!(
        res.is_err(),
        "Expected BetNotExpired error but tx succeeded"
    );
}

#[test]
fn test_reject_settle_with_stale_oracle_snapshot() {
    let mut env = setup();
    let amount = 100_000_000;
    let nonce = 0u32;

    let user = setup_placed_bet(&mut env, 0, 0, amount, 6500, 60);

    // Clock passes expiry but NO new oracle snapshot is pushed:
    // match.updated_at < bet.expires_at -> settlement must be rejected
    let bet = get_bet_account(&env.svm, MATCH_ID, &user.pubkey(), nonce);
    set_clock(&mut env.svm, bet.expires_at + 1);

    let ix = build_settle_bet_ix(
        &env.authority,
        &user.pubkey(),
        MATCH_ID,
        &env.usdc_mint,
        nonce,
    );
    let res = send_tx(&mut env.svm, ix, &env.authority);
    assert!(
        res.is_err(),
        "Expected StaleOracleSnapshot error but tx succeeded"
    );
}

#[test]
fn test_reject_settle_already_settled() {
    let mut env = setup();
    let amount = 100_000_000;
    let nonce = 0u32;

    let user = setup_placed_bet(&mut env, 0, 0, amount, 6500, 60);
    expire_with_odds(&mut env, &user.pubkey(), 6700);

    let ix = build_settle_bet_ix(
        &env.authority,
        &user.pubkey(),
        MATCH_ID,
        &env.usdc_mint,
        nonce,
    );
    send_tx(&mut env.svm, ix, &env.authority).unwrap();

    let ix = build_settle_bet_ix(
        &env.authority,
        &user.pubkey(),
        MATCH_ID,
        &env.usdc_mint,
        nonce,
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

    let user = setup_placed_bet(&mut env, 0, 0, amount, 6500, 60);
    expire_with_odds(&mut env, &user.pubkey(), 6700);

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
    );
    let res = send_tx(&mut env.svm, ix, &random_signer);
    assert!(res.is_err(), "Expected Unauthorized error but tx succeeded");
}

// ===========================================================================
// close_bet tests
// ===========================================================================

#[test]
fn test_close_settled_bet_returns_rent() {
    let mut env = setup();
    let amount = 100_000_000;
    let nonce = 0u32;

    let user = setup_placed_bet(&mut env, 0, 0, amount, 6500, 60);
    expire_with_odds(&mut env, &user.pubkey(), 6700);

    let ix = build_settle_bet_ix(
        &env.authority,
        &user.pubkey(),
        MATCH_ID,
        &env.usdc_mint,
        nonce,
    );
    send_tx(&mut env.svm, ix, &env.authority).unwrap();

    let lamports_before = env.svm.get_account(&user.pubkey()).unwrap().lamports;

    let ix = build_close_bet_ix(&user, MATCH_ID, nonce);
    let res = send_tx(&mut env.svm, ix, &user);
    assert!(res.is_ok(), "Failed to close bet: {:?}", res.err());

    // Bet account is gone and rent came back to the user
    let bet_account = env
        .svm
        .get_account(&bet_pda(MATCH_ID, &user.pubkey(), nonce));
    assert!(
        bet_account.is_none() || bet_account.unwrap().lamports == 0,
        "Bet account should be closed"
    );
    let lamports_after = env.svm.get_account(&user.pubkey()).unwrap().lamports;
    assert!(lamports_after > lamports_before, "Rent was not refunded");
}

#[test]
fn test_reject_close_open_bet() {
    let mut env = setup();
    let amount = 100_000_000;
    let nonce = 0u32;

    let user = setup_placed_bet(&mut env, 0, 0, amount, 6500, 60);

    let ix = build_close_bet_ix(&user, MATCH_ID, nonce);
    let res = send_tx(&mut env.svm, ix, &user);
    assert!(res.is_err(), "Expected BetStillOpen error but tx succeeded");
}

#[test]
fn test_reject_close_by_non_owner() {
    let mut env = setup();
    let amount = 100_000_000;
    let nonce = 0u32;

    let user = setup_placed_bet(&mut env, 0, 0, amount, 6500, 60);
    expire_with_odds(&mut env, &user.pubkey(), 6700);

    let ix = build_settle_bet_ix(
        &env.authority,
        &user.pubkey(),
        MATCH_ID,
        &env.usdc_mint,
        nonce,
    );
    send_tx(&mut env.svm, ix, &env.authority).unwrap();

    // A stranger tries to close the user's bet and pocket the rent
    let attacker = Keypair::new();
    env.svm.airdrop(&attacker.pubkey(), 10_000_000_000).unwrap();

    let ix = Instruction::new_with_bytes(
        betting_engine::id(),
        &betting_engine::instruction::CloseBet {}.data(),
        betting_engine::accounts::CloseBet {
            user: attacker.pubkey(),
            bet: bet_pda(MATCH_ID, &user.pubkey(), nonce),
        }
        .to_account_metas(None),
    );
    let res = send_tx(&mut env.svm, ix, &attacker);
    assert!(res.is_err(), "Expected Unauthorized error but tx succeeded");
}
