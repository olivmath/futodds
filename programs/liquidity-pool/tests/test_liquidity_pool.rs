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
    liquidity_pool::{LpPosition, Pool},
    litesvm::LiteSVM,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

const MATCH_ID: &str = "match_1";
const USDC_DECIMALS: u8 = 6;
const ONE_USDC: u64 = 1_000_000;

struct TestEnv {
    svm: LiteSVM,
    authority: Keypair,
    usdc_mint: Pubkey,
}

fn setup() -> TestEnv {
    let mut svm = LiteSVM::new();

    let pool_bytes = include_bytes!(concat!(
        env!("CARGO_TARGET_TMPDIR"),
        "/../deploy/liquidity_pool.so"
    ));
    svm.add_program(liquidity_pool::id(), pool_bytes)
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

    send_txs(svm, &[create_account_ix, init_mint_ix], &[payer, &mint]).unwrap();
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
    send_txs(svm, &[ix], &[signer])
}

fn send_txs(svm: &mut LiteSVM, ixs: &[Instruction], signers: &[&Keypair]) -> Result<(), String> {
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(ixs, Some(&signers[0].pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), signers).unwrap();
    svm.send_transaction(tx)
        .map(|_| ())
        .map_err(|e| format!("{e:?}"))
}

fn token_balance(svm: &LiteSVM, token_account: &Pubkey) -> u64 {
    let account = svm.get_account(token_account).unwrap();
    spl_token::state::Account::unpack(&account.data)
        .unwrap()
        .amount
}

fn pool_pda(match_id: &str) -> Pubkey {
    Pubkey::find_program_address(&[b"pool", match_id.as_bytes()], &liquidity_pool::id()).0
}

fn vault_authority(match_id: &str) -> Pubkey {
    Pubkey::find_program_address(&[b"vault", match_id.as_bytes()], &liquidity_pool::id()).0
}

fn lp_position_pda(pool: &Pubkey, owner: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[b"lp", pool.as_ref(), owner.as_ref()],
        &liquidity_pool::id(),
    )
    .0
}

fn create_pool_ix(authority: &Pubkey, mint: &Pubkey, match_id: &str, fee_rate: u16) -> Instruction {
    let pool = pool_pda(match_id);
    let vault_authority = vault_authority(match_id);
    let vault = get_associated_token_address(&vault_authority, mint);

    Instruction::new_with_bytes(
        liquidity_pool::id(),
        &liquidity_pool::instruction::CreatePool {
            match_id: match_id.to_string(),
            fee_rate,
        }
        .data(),
        liquidity_pool::accounts::CreatePool {
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

fn deposit_ix(owner: &Pubkey, mint: &Pubkey, match_id: &str, amount: u64) -> Instruction {
    let pool = pool_pda(match_id);
    let lp_position = lp_position_pda(&pool, owner);
    let vault = get_associated_token_address(&vault_authority(match_id), mint);
    let owner_token_account = get_associated_token_address(owner, mint);

    Instruction::new_with_bytes(
        liquidity_pool::id(),
        &liquidity_pool::instruction::Deposit { amount }.data(),
        liquidity_pool::accounts::Deposit {
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

fn read_pool(svm: &LiteSVM, pool: &Pubkey) -> Pool {
    let account = svm.get_account(pool).unwrap();
    Pool::try_deserialize(&mut account.data.as_slice()).unwrap()
}

fn read_lp_position(svm: &LiteSVM, lp_position: &Pubkey) -> LpPosition {
    let account = svm.get_account(lp_position).unwrap();
    LpPosition::try_deserialize(&mut account.data.as_slice()).unwrap()
}

#[test]
fn test_create_pool_initializes_vault_and_state() {
    let mut env = setup();

    let ix = create_pool_ix(&env.authority.pubkey(), &env.usdc_mint, MATCH_ID, 200);
    send_tx(&mut env.svm, ix, &env.authority).unwrap();

    let pool_key = pool_pda(MATCH_ID);
    let pool = read_pool(&env.svm, &pool_key);
    let vault = get_associated_token_address(&vault_authority(MATCH_ID), &env.usdc_mint);

    assert_eq!(pool.authority, env.authority.pubkey());
    assert_eq!(pool.match_id, MATCH_ID);
    assert_eq!(pool.mint, env.usdc_mint);
    assert_eq!(pool.vault, vault);
    assert_eq!(pool.fee_rate, 200);
    assert_eq!(pool.total_liquidity, 0);
    assert_eq!(pool.locked_liquidity, 0);
    assert_eq!(token_balance(&env.svm, &vault), 0);
}

#[test]
fn test_first_deposit_mints_one_to_one_shares() {
    let mut env = setup();
    let lp = Keypair::new();
    env.svm.airdrop(&lp.pubkey(), 10_000_000_000).unwrap();

    let lp_ata = create_ata(&mut env.svm, &env.authority, &lp.pubkey(), &env.usdc_mint);
    mint_to(
        &mut env.svm,
        &env.usdc_mint,
        &lp_ata,
        &env.authority,
        10_000 * ONE_USDC,
    );

    send_tx(
        &mut env.svm,
        create_pool_ix(&env.authority.pubkey(), &env.usdc_mint, MATCH_ID, 200),
        &env.authority,
    )
    .unwrap();
    send_tx(
        &mut env.svm,
        deposit_ix(&lp.pubkey(), &env.usdc_mint, MATCH_ID, 10_000 * ONE_USDC),
        &lp,
    )
    .unwrap();

    let pool_key = pool_pda(MATCH_ID);
    let lp_key = lp_position_pda(&pool_key, &lp.pubkey());
    let pool = read_pool(&env.svm, &pool_key);
    let position = read_lp_position(&env.svm, &lp_key);
    let vault = get_associated_token_address(&vault_authority(MATCH_ID), &env.usdc_mint);

    assert_eq!(pool.total_liquidity, 10_000 * ONE_USDC);
    assert_eq!(pool.total_shares, 10_000 * ONE_USDC);
    assert_eq!(position.shares, 10_000 * ONE_USDC);
    assert_eq!(token_balance(&env.svm, &vault), 10_000 * ONE_USDC);
}

#[test]
fn test_second_deposit_gets_proportional_shares() {
    let mut env = setup();
    let lp1 = Keypair::new();
    let lp2 = Keypair::new();
    env.svm.airdrop(&lp1.pubkey(), 10_000_000_000).unwrap();
    env.svm.airdrop(&lp2.pubkey(), 10_000_000_000).unwrap();

    let lp1_ata = create_ata(&mut env.svm, &env.authority, &lp1.pubkey(), &env.usdc_mint);
    let lp2_ata = create_ata(&mut env.svm, &env.authority, &lp2.pubkey(), &env.usdc_mint);
    mint_to(
        &mut env.svm,
        &env.usdc_mint,
        &lp1_ata,
        &env.authority,
        10_000 * ONE_USDC,
    );
    mint_to(
        &mut env.svm,
        &env.usdc_mint,
        &lp2_ata,
        &env.authority,
        5_000 * ONE_USDC,
    );

    send_tx(
        &mut env.svm,
        create_pool_ix(&env.authority.pubkey(), &env.usdc_mint, MATCH_ID, 200),
        &env.authority,
    )
    .unwrap();
    send_tx(
        &mut env.svm,
        deposit_ix(&lp1.pubkey(), &env.usdc_mint, MATCH_ID, 10_000 * ONE_USDC),
        &lp1,
    )
    .unwrap();
    send_tx(
        &mut env.svm,
        deposit_ix(&lp2.pubkey(), &env.usdc_mint, MATCH_ID, 5_000 * ONE_USDC),
        &lp2,
    )
    .unwrap();

    let pool_key = pool_pda(MATCH_ID);
    let lp2_key = lp_position_pda(&pool_key, &lp2.pubkey());
    let pool = read_pool(&env.svm, &pool_key);
    let position = read_lp_position(&env.svm, &lp2_key);

    assert_eq!(pool.total_liquidity, 15_000 * ONE_USDC);
    assert_eq!(pool.total_shares, 15_000 * ONE_USDC);
    assert_eq!(position.shares, 5_000 * ONE_USDC);
}

#[test]
fn test_rejects_small_deposit() {
    let mut env = setup();
    let lp = Keypair::new();
    env.svm.airdrop(&lp.pubkey(), 10_000_000_000).unwrap();
    create_ata(&mut env.svm, &env.authority, &lp.pubkey(), &env.usdc_mint);

    send_tx(
        &mut env.svm,
        create_pool_ix(&env.authority.pubkey(), &env.usdc_mint, MATCH_ID, 200),
        &env.authority,
    )
    .unwrap();
    let err = send_tx(
        &mut env.svm,
        deposit_ix(&lp.pubkey(), &env.usdc_mint, MATCH_ID, ONE_USDC - 1),
        &lp,
    )
    .unwrap_err();

    assert!(err.contains("DepositTooSmall"));
}

#[test]
fn test_rejects_invalid_fee_rate() {
    let mut env = setup();

    let err = send_tx(
        &mut env.svm,
        create_pool_ix(&env.authority.pubkey(), &env.usdc_mint, MATCH_ID, 1_001),
        &env.authority,
    )
    .unwrap_err();

    assert!(err.contains("InvalidFeeRate"));
}
