use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::{instruction::Instruction, system_program},
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    litesvm::{types::TransactionMetadata, LiteSVM},
    oracle_adapter::MatchAccount,
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
    let match_account =
        Pubkey::find_program_address(&[b"match", match_id.as_bytes()], &program_id).0;

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

#[test]
fn test_create_match_with_initial_odds() {
    let (mut svm, payer) = setup();
    let match_id = "match_1";

    let ix = build_update_odds_ix(&payer, match_id, 6500, 3000, 500);
    let res = send_tx(&mut svm, ix, &payer);
    assert!(res.is_ok(), "Failed to create match: {:?}", res.err());

    let program_id = oracle_adapter::id();
    let match_pda = Pubkey::find_program_address(&[b"match", match_id.as_bytes()], &program_id).0;

    let account = svm.get_account(&match_pda).unwrap();
    let mut data: &[u8] = &account.data;
    let match_state = MatchAccount::try_deserialize(&mut data).unwrap();

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
    let match_pda = Pubkey::find_program_address(&[b"match", match_id.as_bytes()], &program_id).0;

    let account = svm.get_account(&match_pda).unwrap();
    let mut data: &[u8] = &account.data;
    let match_state = MatchAccount::try_deserialize(&mut data).unwrap();

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
    assert!(
        res.is_err(),
        "Expected InvalidOddsSum error but tx succeeded"
    );
}

#[test]
fn test_update_odds_emits_odds_updated_event() {
    let (mut svm, payer) = setup();
    let match_id = "match_1";

    let ix = build_update_odds_ix(&payer, match_id, 6500, 3000, 500);
    let meta = send_tx_with_metadata(&mut svm, ix, &payer).expect("update_odds should succeed");
    let program_id = oracle_adapter::id();
    let match_pda = Pubkey::find_program_address(&[b"match", match_id.as_bytes()], &program_id).0;
    let account = svm.get_account(&match_pda).unwrap();
    let mut data: &[u8] = &account.data;
    let match_state = MatchAccount::try_deserialize(&mut data).unwrap();

    let payload = anchor_event_payload(&meta.logs, &[156, 39, 18, 117, 46, 12, 46, 218]);
    let mut offset = 8;

    assert_eq!(
        Pubkey::new_from_array(payload[offset..offset + 32].try_into().unwrap()),
        payer.pubkey()
    );
    offset += 32;

    let match_id_len = u32::from_le_bytes(payload[offset..offset + 4].try_into().unwrap()) as usize;
    offset += 4;
    assert_eq!(
        std::str::from_utf8(&payload[offset..offset + match_id_len]).unwrap(),
        match_id
    );
    offset += match_id_len;

    assert_eq!(
        u16::from_le_bytes(payload[offset..offset + 2].try_into().unwrap()),
        6500
    );
    offset += 2;
    assert_eq!(
        u16::from_le_bytes(payload[offset..offset + 2].try_into().unwrap()),
        3000
    );
    offset += 2;
    assert_eq!(
        u16::from_le_bytes(payload[offset..offset + 2].try_into().unwrap()),
        500
    );
    offset += 2;
    assert_eq!(
        i64::from_le_bytes(payload[offset..offset + 8].try_into().unwrap()),
        match_state.updated_at
    );
}
