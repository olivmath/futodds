
use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::{instruction::Instruction, system_program},
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    litesvm::LiteSVM,
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

fn build_update_odds_ix(
    authority: &Keypair,
    match_id: &str,
    odds_home: u16,
    odds_away: u16,
    odds_draw: u16,
) -> Instruction {
    let program_id = oracle_adapter::id();
    let match_account = Pubkey::find_program_address(
        &[b"match", match_id.as_bytes()],
        &program_id,
    )
    .0;

    Instruction::new_with_bytes(
        program_id,
        &oracle_adapter::instruction::UpdateOdds {
            match_id: match_id.to_string(),
            odds_home,
            odds_away,
            odds_draw,
        }
        .data(),
        oracle_adapter::accounts::UpdateOdds {
            authority: authority.pubkey(),
            match_account,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

fn send_tx(svm: &mut LiteSVM, ix: Instruction, signer: &Keypair) -> Result<(), String> {
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&signer.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[signer]).unwrap();
    svm.send_transaction(tx).map(|_| ()).map_err(|e| e.to_string())
}

#[test]
fn test_create_match_with_initial_odds() {
    let (mut svm, payer) = setup();
    let match_id = "match_1";

    let ix = build_update_odds_ix(&payer, match_id, 6500, 3000, 500);
    let res = send_tx(&mut svm, ix, &payer);
    assert!(res.is_ok(), "Failed to create match: {:?}", res.err());

    let program_id = oracle_adapter::id();
    let match_pda = Pubkey::find_program_address(
        &[b"match", match_id.as_bytes()],
        &program_id,
    )
    .0;

    let account = svm.get_account(&match_pda).unwrap();
    let mut data: &[u8] = &account.data;
    let match_state =
        oracle_adapter::state::MatchAccount::try_deserialize(&mut data).unwrap();

    assert_eq!(match_state.odds_home, 6500);
    assert_eq!(match_state.odds_away, 3000);
    assert_eq!(match_state.odds_draw, 500);
    assert_eq!(match_state.match_id, match_id);
    assert_eq!(match_state.authority, payer.pubkey());
}

#[test]
fn test_update_existing_odds() {
    let (mut svm, payer) = setup();
    let match_id = "match_1";

    let ix = build_update_odds_ix(&payer, match_id, 6500, 3000, 500);
    let res = send_tx(&mut svm, ix, &payer);
    assert!(res.is_ok(), "Failed to create match: {:?}", res.err());

    let ix = build_update_odds_ix(&payer, match_id, 6700, 2800, 500);
    let res = send_tx(&mut svm, ix, &payer);
    assert!(res.is_ok(), "Failed to update match: {:?}", res.err());

    let program_id = oracle_adapter::id();
    let match_pda = Pubkey::find_program_address(
        &[b"match", match_id.as_bytes()],
        &program_id,
    )
    .0;

    let account = svm.get_account(&match_pda).unwrap();
    let mut data: &[u8] = &account.data;
    let match_state =
        oracle_adapter::state::MatchAccount::try_deserialize(&mut data).unwrap();

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
    let res = send_tx(&mut svm, ix, &authority_a);
    assert!(res.is_ok(), "Failed to create match: {:?}", res.err());

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
    assert!(res.is_err(), "Expected InvalidOddsSum error but tx succeeded");
}
