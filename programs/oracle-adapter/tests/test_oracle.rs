use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::{instruction::Instruction, system_program},
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    litesvm::LiteSVM,
    oracle_adapter::{
        MatchAccount, MATCH_STATUS_LIVE, MATCH_STATUS_SETTLED, MATCH_STATUS_UPCOMING,
    },
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

fn setup() -> (LiteSVM, Keypair) {
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!(concat!(
        env!("CARGO_TARGET_TMPDIR"),
        "/../deploy/oracle_adapter.so"
    ));
    let program_id = oracle_adapter::id();
    svm.add_program(program_id, bytes).unwrap();
    let payer = Keypair::new();
    svm.airdrop(&payer.pubkey(), 10_000_000_000).unwrap();
    (svm, payer)
}

fn match_pda(match_id: &str) -> Pubkey {
    Pubkey::find_program_address(&[b"match", match_id.as_bytes()], &oracle_adapter::id()).0
}

fn build_update_odds_ix(
    authority: &Keypair,
    match_id: &str,
    odds_home: u16,
    odds_away: u16,
    odds_draw: u16,
) -> Instruction {
    Instruction::new_with_bytes(
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
            match_account: match_pda(match_id),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

fn build_set_status_ix(authority: &Keypair, match_id: &str, new_status: u8) -> Instruction {
    Instruction::new_with_bytes(
        oracle_adapter::id(),
        &oracle_adapter::instruction::SetMatchStatus { new_status }.data(),
        oracle_adapter::accounts::MutateMatch {
            authority: authority.pubkey(),
            match_account: match_pda(match_id),
        }
        .to_account_metas(None),
    )
}

fn build_set_authority_ix(
    authority: &Keypair,
    match_id: &str,
    new_authority: &Pubkey,
) -> Instruction {
    Instruction::new_with_bytes(
        oracle_adapter::id(),
        &oracle_adapter::instruction::SetAuthority {
            new_authority: *new_authority,
        }
        .data(),
        oracle_adapter::accounts::MutateMatch {
            authority: authority.pubkey(),
            match_account: match_pda(match_id),
        }
        .to_account_metas(None),
    )
}

fn send_tx(svm: &mut LiteSVM, ix: Instruction, signer: &Keypair) -> Result<(), String> {
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&signer.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[signer]).unwrap();
    svm.send_transaction(tx)
        .map(|_| ())
        .map_err(|e| format!("{e:?}"))
}

fn get_match(svm: &LiteSVM, match_id: &str) -> MatchAccount {
    let account = svm.get_account(&match_pda(match_id)).unwrap();
    let mut data: &[u8] = &account.data;
    MatchAccount::try_deserialize(&mut data).unwrap()
}

#[test]
fn test_create_match_with_initial_odds() {
    let (mut svm, payer) = setup();
    let match_id = "match_1";

    let ix = build_update_odds_ix(&payer, match_id, 6500, 3000, 500);
    let res = send_tx(&mut svm, ix, &payer);
    assert!(res.is_ok(), "Failed to create match: {:?}", res.err());

    let match_state = get_match(&svm, match_id);
    assert_eq!(match_state.odds_home, 6500);
    assert_eq!(match_state.odds_away, 3000);
    assert_eq!(match_state.odds_draw, 500);
    assert_eq!(match_state.match_id, match_id);
    assert_eq!(match_state.authority, payer.pubkey());
    assert_eq!(match_state.status, MATCH_STATUS_UPCOMING);
}

#[test]
fn test_update_existing_odds() {
    let (mut svm, payer) = setup();
    let match_id = "match_1";

    let ix = build_update_odds_ix(&payer, match_id, 6500, 3000, 500);
    send_tx(&mut svm, ix, &payer).unwrap();

    let ix = build_update_odds_ix(&payer, match_id, 6700, 2800, 500);
    let res = send_tx(&mut svm, ix, &payer);
    assert!(res.is_ok(), "Failed to update match: {:?}", res.err());

    let match_state = get_match(&svm, match_id);
    assert_eq!(match_state.odds_home, 6700);
    assert_eq!(match_state.odds_away, 2800);
    assert_eq!(match_state.odds_draw, 500);
}

#[test]
fn test_reject_unauthorized_signer() {
    let (mut svm, authority_a) = setup();
    let authority_b = Keypair::new();
    svm.airdrop(&authority_b.pubkey(), 10_000_000_000).unwrap();

    let match_id = "match_1";

    let ix = build_update_odds_ix(&authority_a, match_id, 6500, 3000, 500);
    send_tx(&mut svm, ix, &authority_a).unwrap();

    let ix = build_update_odds_ix(&authority_b, match_id, 6700, 2800, 500);
    let res = send_tx(&mut svm, ix, &authority_b);
    assert!(res.is_err(), "Expected unauthorized error but tx succeeded");
}

#[test]
fn test_reject_invalid_odds_sum() {
    let (mut svm, payer) = setup();
    let match_id = "match_1";

    // 6500 + 3000 + 600 = 10100, should fail
    let ix = build_update_odds_ix(&payer, match_id, 6500, 3000, 600);
    let res = send_tx(&mut svm, ix, &payer);
    assert!(
        res.is_err(),
        "Expected InvalidOddsSum error but tx succeeded"
    );
}

#[test]
fn test_set_match_status_transitions() {
    let (mut svm, payer) = setup();
    let match_id = "match_1";

    let ix = build_update_odds_ix(&payer, match_id, 6500, 3000, 500);
    send_tx(&mut svm, ix, &payer).unwrap();

    let ix = build_set_status_ix(&payer, match_id, MATCH_STATUS_LIVE);
    let res = send_tx(&mut svm, ix, &payer);
    assert!(res.is_ok(), "Failed to set live: {:?}", res.err());
    assert_eq!(get_match(&svm, match_id).status, MATCH_STATUS_LIVE);

    let ix = build_set_status_ix(&payer, match_id, MATCH_STATUS_SETTLED);
    let res = send_tx(&mut svm, ix, &payer);
    assert!(res.is_ok(), "Failed to set settled: {:?}", res.err());
    assert_eq!(get_match(&svm, match_id).status, MATCH_STATUS_SETTLED);
}

#[test]
fn test_reject_invalid_status_value() {
    let (mut svm, payer) = setup();
    let match_id = "match_1";

    let ix = build_update_odds_ix(&payer, match_id, 6500, 3000, 500);
    send_tx(&mut svm, ix, &payer).unwrap();

    let ix = build_set_status_ix(&payer, match_id, 3);
    let res = send_tx(&mut svm, ix, &payer);
    assert!(
        res.is_err(),
        "Expected InvalidMatchStatus error but tx succeeded"
    );
}

#[test]
fn test_reject_set_status_by_non_authority() {
    let (mut svm, authority_a) = setup();
    let authority_b = Keypair::new();
    svm.airdrop(&authority_b.pubkey(), 10_000_000_000).unwrap();

    let match_id = "match_1";

    let ix = build_update_odds_ix(&authority_a, match_id, 6500, 3000, 500);
    send_tx(&mut svm, ix, &authority_a).unwrap();

    let ix = build_set_status_ix(&authority_b, match_id, MATCH_STATUS_LIVE);
    let res = send_tx(&mut svm, ix, &authority_b);
    assert!(res.is_err(), "Expected unauthorized error but tx succeeded");
}

#[test]
fn test_reject_update_odds_on_settled_match() {
    let (mut svm, payer) = setup();
    let match_id = "match_1";

    let ix = build_update_odds_ix(&payer, match_id, 6500, 3000, 500);
    send_tx(&mut svm, ix, &payer).unwrap();

    let ix = build_set_status_ix(&payer, match_id, MATCH_STATUS_SETTLED);
    send_tx(&mut svm, ix, &payer).unwrap();

    let ix = build_update_odds_ix(&payer, match_id, 6700, 2800, 500);
    let res = send_tx(&mut svm, ix, &payer);
    assert!(
        res.is_err(),
        "Expected MatchAlreadySettled error but tx succeeded"
    );
}

#[test]
fn test_set_authority_rotates_and_old_key_is_rejected() {
    let (mut svm, old_authority) = setup();
    let new_authority = Keypair::new();
    svm.airdrop(&new_authority.pubkey(), 10_000_000_000)
        .unwrap();

    let match_id = "match_1";

    let ix = build_update_odds_ix(&old_authority, match_id, 6500, 3000, 500);
    send_tx(&mut svm, ix, &old_authority).unwrap();

    let ix = build_set_authority_ix(&old_authority, match_id, &new_authority.pubkey());
    let res = send_tx(&mut svm, ix, &old_authority);
    assert!(res.is_ok(), "Failed to rotate authority: {:?}", res.err());
    assert_eq!(get_match(&svm, match_id).authority, new_authority.pubkey());

    // Old key can no longer write odds
    let ix = build_update_odds_ix(&old_authority, match_id, 6700, 2800, 500);
    let res = send_tx(&mut svm, ix, &old_authority);
    assert!(res.is_err(), "Expected unauthorized error but tx succeeded");

    // New key can
    let ix = build_update_odds_ix(&new_authority, match_id, 6700, 2800, 500);
    let res = send_tx(&mut svm, ix, &new_authority);
    assert!(
        res.is_ok(),
        "New authority failed to update: {:?}",
        res.err()
    );
}
