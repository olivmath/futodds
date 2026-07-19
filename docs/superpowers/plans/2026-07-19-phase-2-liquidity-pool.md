# Phase 2 Liquidity Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Phase 2 with a USDC-backed liquidity pool, LP deposits/shares, betting-engine pool integration, withdrawals, and fee claims.

**Architecture:** Add a new Anchor program, `liquidity-pool`, that owns pool state, LP accounting, and the USDC vault authority. Refactor `betting-engine` so `place_bet` and `settle_bet` use the pool vault and mutate `Pool` accounting directly through passed accounts. Keep Phase 2 payout fixed at 1.8x after fee; dynamic payout and exposure caps remain Phase 3.

**Tech Stack:** Rust 1.89.0, Anchor 1.1.2, anchor-spl 1.1.2, LiteSVM Rust tests, SPL Token, Associated Token Program.

## Global Constraints

- Use USDC/test USDC as the betting and liquidity asset.
- Add `programs/liquidity-pool` under the existing Anchor workspace.
- Pool PDA seeds: `["pool", match_id]`.
- LP position PDA seeds: `["lp", pool, owner]`.
- Pool vault authority PDA seeds: `["vault", match_id]`.
- Pool vault token account: ATA of pool vault authority for pool mint.
- Fee rate `200` means 2.00%.
- Fee split: 25% protocol fee, 75% LP fee.
- Phase 2 payout remains fixed: `payout = effective_amount * 18 / 10`.
- `betting-engine` must stop using `["escrow", match_id]` for active bets.
- Do not modify `app/` in this implementation pass.
- Preserve existing oracle semantics and tests.
- Run `cargo fmt --all`, `anchor build`, and `cargo test` before marking Phase 2 complete.

---

## File Structure

| Path | Responsibility |
|---|---|
| `programs/liquidity-pool/Cargo.toml` | New Anchor crate config and test dependencies |
| `programs/liquidity-pool/src/lib.rs` | Pool instructions, accounts, state, errors, shared constants |
| `programs/liquidity-pool/tests/test_liquidity_pool.rs` | LiteSVM tests for create/deposit/withdraw/claim |
| `programs/betting-engine/Cargo.toml` | Add `liquidity_pool` dependency |
| `programs/betting-engine/src/lib.rs` | Replace escrow vault with pool vault/accounting |
| `programs/betting-engine/tests/test_betting.rs` | Update test builders and assertions for pool-backed bets |
| `backend/src/solana.js` | Update account derivations from escrow to pool vault when building betting txs |
| `backend/test/solana.test.js` | Update expected PDA/ATA builders |
| `docs/fase-2a-pool-deposit.md` | Mark real implementation evidence after tests pass |
| `docs/fase-2b-pool-integration.md` | Mark real implementation evidence after tests pass |
| `docs/fase-2c-withdraw-fees.md` | Mark real implementation evidence after tests pass |

---

### Task 1: Scaffold `liquidity-pool` Program

**Files:**
- Create: `programs/liquidity-pool/Cargo.toml`
- Create: `programs/liquidity-pool/src/lib.rs`
- Create: `programs/liquidity-pool/tests/test_liquidity_pool.rs`

**Interfaces:**
- Produces: `liquidity_pool::Pool`
- Produces: `liquidity_pool::LpPosition`
- Produces: `liquidity_pool::instruction::CreatePool { match_id, fee_rate }`
- Produces: `liquidity_pool::instruction::Deposit { amount }`
- Produces: `liquidity_pool::accounts::CreatePool`
- Produces: `liquidity_pool::accounts::Deposit`

- [ ] **Step 1: Create crate config**

Create `programs/liquidity-pool/Cargo.toml`:

```toml
[package]
name = "liquidity_pool"
version = "0.1.0"
description = "Liquidity pool for FutOdds betting markets"
edition.workspace = true
rust-version.workspace = true

[lib]
crate-type = ["cdylib", "lib"]
name = "liquidity_pool"
doctest = false

[features]
default = []
cpi = ["no-entrypoint"]
no-entrypoint = []
no-log-ix-name = []
idl-build = ["anchor-lang/idl-build", "anchor-spl/idl-build"]
anchor-debug = []
custom-heap = []
custom-panic = []

[dependencies]
anchor-lang = { version = "1.1.2", features = ["init-if-needed"] }
anchor-spl = "1.1.2"

[dev-dependencies]
litesvm = "0.10.0"
solana-message = "3.0.1"
solana-transaction = "3.0.2"
solana-signer = "3.0.0"
solana-keypair = "3.0.1"

[lints.rust]
unexpected_cfgs = { level = "warn", check-cfg = ['cfg(target_os, values("solana"))'] }
```

- [ ] **Step 2: Create minimal program shell**

Create `programs/liquidity-pool/src/lib.rs`:

```rust
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("11111111111111111111111111111111");

pub const MIN_DEPOSIT_AMOUNT: u64 = 1_000_000;
pub const MAX_FEE_RATE: u16 = 1_000;
pub const FEE_SCALE: u128 = 1_000_000_000_000;

#[program]
pub mod liquidity_pool {
    use super::*;

    pub fn create_pool(ctx: Context<CreatePool>, match_id: String, fee_rate: u16) -> Result<()> {
        require!(fee_rate <= MAX_FEE_RATE, LiquidityPoolError::InvalidFeeRate);

        let pool = &mut ctx.accounts.pool;
        pool.authority = ctx.accounts.authority.key();
        pool.match_id = match_id;
        pool.mint = ctx.accounts.mint.key();
        pool.vault = ctx.accounts.vault.key();
        pool.total_liquidity = 0;
        pool.locked_liquidity = 0;
        pool.fee_rate = fee_rate;
        pool.protocol_fees_accumulated = 0;
        pool.fees_per_share = 0;
        pool.total_shares = 0;
        pool.bump = ctx.bumps.pool;
        pool.vault_authority_bump = ctx.bumps.vault_authority;

        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount >= MIN_DEPOSIT_AMOUNT, LiquidityPoolError::DepositTooSmall);

        let pool = &mut ctx.accounts.pool;
        let shares = if pool.total_shares == 0 {
            amount
        } else {
            checked_u128_to_u64(
                (amount as u128)
                    .checked_mul(pool.total_shares as u128)
                    .ok_or(LiquidityPoolError::MathOverflow)?
                    .checked_div(pool.total_liquidity as u128)
                    .ok_or(LiquidityPoolError::MathOverflow)?,
            )?
        };

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.owner_token_account.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            amount,
        )?;

        let lp_position = &mut ctx.accounts.lp_position;
        lp_position.owner = ctx.accounts.owner.key();
        lp_position.pool = pool.key();
        lp_position.shares = lp_position
            .shares
            .checked_add(shares)
            .ok_or(LiquidityPoolError::MathOverflow)?;
        lp_position.deposited_at = Clock::get()?.unix_timestamp;
        lp_position.fees_claimed_per_share = pool.fees_per_share;
        lp_position.bump = ctx.bumps.lp_position;

        pool.total_liquidity = pool
            .total_liquidity
            .checked_add(amount)
            .ok_or(LiquidityPoolError::MathOverflow)?;
        pool.total_shares = pool
            .total_shares
            .checked_add(shares)
            .ok_or(LiquidityPoolError::MathOverflow)?;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(match_id: String)]
pub struct CreatePool<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + Pool::INIT_SPACE,
        seeds = [b"pool", match_id.as_bytes()],
        bump,
    )]
    pub pool: Account<'info, Pool>,

    pub mint: Account<'info, Mint>,

    #[account(
        seeds = [b"vault", match_id.as_bytes()],
        bump,
    )]
    /// CHECK: PDA authority for the pool vault token account.
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
        init,
        payer = authority,
        associated_token::mint = mint,
        associated_token::authority = vault_authority,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(mut, has_one = mint, has_one = vault)]
    pub pool: Account<'info, Pool>,

    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + LpPosition::INIT_SPACE,
        seeds = [b"lp", pool.key().as_ref(), owner.key().as_ref()],
        bump,
    )]
    pub lp_position: Account<'info, LpPosition>,

    pub mint: Account<'info, Mint>,

    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = owner_token_account.owner == owner.key(),
        constraint = owner_token_account.mint == mint.key(),
    )]
    pub owner_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct Pool {
    pub authority: Pubkey,
    #[max_len(36)]
    pub match_id: String,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub total_liquidity: u64,
    pub locked_liquidity: u64,
    pub fee_rate: u16,
    pub protocol_fees_accumulated: u64,
    pub fees_per_share: u128,
    pub total_shares: u64,
    pub bump: u8,
    pub vault_authority_bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct LpPosition {
    pub owner: Pubkey,
    pub pool: Pubkey,
    pub shares: u64,
    pub deposited_at: i64,
    pub fees_claimed_per_share: u128,
    pub bump: u8,
}

#[error_code]
pub enum LiquidityPoolError {
    #[msg("Fee rate is too high")]
    InvalidFeeRate,
    #[msg("Deposit is below the minimum amount")]
    DepositTooSmall,
    #[msg("Withdraw amount must be greater than zero")]
    WithdrawTooSmall,
    #[msg("LP position does not have enough shares")]
    InsufficientShares,
    #[msg("Pool does not have enough unlocked liquidity")]
    InsufficientLiquidity,
    #[msg("LP shares are required")]
    NoLpShares,
    #[msg("Math overflow")]
    MathOverflow,
}

pub fn checked_u128_to_u64(value: u128) -> Result<u64> {
    u64::try_from(value).map_err(|_| LiquidityPoolError::MathOverflow.into())
}
```

- [ ] **Step 3: Build to catch scaffold errors**

Run:

```bash
anchor build
```

Expected: FAIL because the new program id is still the placeholder and generated key sync is needed, or PASS if Anchor tolerates the temporary id. Continue to Step 4 either way.

- [ ] **Step 4: Generate/sync program key**

Run:

```bash
anchor keys sync
```

Expected: `programs/liquidity-pool/src/lib.rs` gets a real local program id and `Anchor.toml` gains `liquidity_pool` under `[programs.localnet]`.

- [ ] **Step 5: Run build again**

Run:

```bash
anchor build
```

Expected: PASS with `oracle_adapter`, `betting_engine`, and `liquidity_pool` artifacts.

- [ ] **Step 6: Commit**

```bash
git add Anchor.toml programs/liquidity-pool/Cargo.toml programs/liquidity-pool/src/lib.rs
git commit -m "feat: scaffold liquidity pool program"
```

---

### Task 2: Add Pool Create/Deposit Tests

**Files:**
- Modify: `programs/liquidity-pool/tests/test_liquidity_pool.rs`

**Interfaces:**
- Consumes: `create_pool(match_id, fee_rate)`
- Consumes: `deposit(amount)`
- Produces: reusable LiteSVM helpers for mint, ATA, token balance, and pool PDA derivations

- [ ] **Step 1: Write tests and helpers**

Create `programs/liquidity-pool/tests/test_liquidity_pool.rs` with:

```rust
use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::{instruction::Instruction, program_pack::Pack, system_instruction, system_program},
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
    svm.add_program(liquidity_pool::id(), pool_bytes).unwrap();

    let authority = Keypair::new();
    svm.airdrop(&authority.pubkey(), 10_000_000_000).unwrap();
    let usdc_mint = create_mint(&mut svm, &authority, &authority.pubkey(), USDC_DECIMALS);

    TestEnv { svm, authority, usdc_mint }
}

fn create_mint(svm: &mut LiteSVM, payer: &Keypair, mint_authority: &Pubkey, decimals: u8) -> Pubkey {
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
    send_txs(svm, &[ix], &[signer])
}

fn send_txs(svm: &mut LiteSVM, ixs: &[Instruction], signers: &[&Keypair]) -> Result<(), String> {
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(ixs, Some(&signers[0].pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), signers).unwrap();
    svm.send_transaction(tx).map(|_| ()).map_err(|e| format!("{e:?}"))
}

fn token_balance(svm: &LiteSVM, token_account: &Pubkey) -> u64 {
    let account = svm.get_account(token_account).unwrap();
    spl_token::state::Account::unpack(&account.data).unwrap().amount
}

fn pool_pda(match_id: &str) -> Pubkey {
    Pubkey::find_program_address(&[b"pool", match_id.as_bytes()], &liquidity_pool::id()).0
}

fn vault_authority(match_id: &str) -> Pubkey {
    Pubkey::find_program_address(&[b"vault", match_id.as_bytes()], &liquidity_pool::id()).0
}

fn lp_position_pda(pool: &Pubkey, owner: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"lp", pool.as_ref(), owner.as_ref()], &liquidity_pool::id()).0
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

fn read_lp_position(svm: &LiteSVM, lp: &Pubkey) -> LpPosition {
    let account = svm.get_account(lp).unwrap();
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
    mint_to(&mut env.svm, &env.usdc_mint, &lp_ata, &env.authority, 10_000 * ONE_USDC);

    send_tx(&mut env.svm, create_pool_ix(&env.authority.pubkey(), &env.usdc_mint, MATCH_ID, 200), &env.authority).unwrap();
    send_tx(&mut env.svm, deposit_ix(&lp.pubkey(), &env.usdc_mint, MATCH_ID, 10_000 * ONE_USDC), &lp).unwrap();

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
    mint_to(&mut env.svm, &env.usdc_mint, &lp1_ata, &env.authority, 10_000 * ONE_USDC);
    mint_to(&mut env.svm, &env.usdc_mint, &lp2_ata, &env.authority, 5_000 * ONE_USDC);

    send_tx(&mut env.svm, create_pool_ix(&env.authority.pubkey(), &env.usdc_mint, MATCH_ID, 200), &env.authority).unwrap();
    send_tx(&mut env.svm, deposit_ix(&lp1.pubkey(), &env.usdc_mint, MATCH_ID, 10_000 * ONE_USDC), &lp1).unwrap();
    send_tx(&mut env.svm, deposit_ix(&lp2.pubkey(), &env.usdc_mint, MATCH_ID, 5_000 * ONE_USDC), &lp2).unwrap();

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

    send_tx(&mut env.svm, create_pool_ix(&env.authority.pubkey(), &env.usdc_mint, MATCH_ID, 200), &env.authority).unwrap();
    let err = send_tx(&mut env.svm, deposit_ix(&lp.pubkey(), &env.usdc_mint, MATCH_ID, ONE_USDC - 1), &lp).unwrap_err();

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
```

- [ ] **Step 2: Run the tests**

Run:

```bash
anchor build
cargo test -p liquidity_pool
```

Expected: PASS for 5 pool tests.

- [ ] **Step 3: Commit**

```bash
git add programs/liquidity-pool/tests/test_liquidity_pool.rs
git commit -m "test: cover liquidity pool deposits"
```

---

### Task 3: Integrate `betting-engine` With Pool Vault

**Files:**
- Modify: `programs/betting-engine/Cargo.toml`
- Modify: `programs/betting-engine/src/lib.rs`
- Modify: `programs/betting-engine/tests/test_betting.rs`

**Interfaces:**
- Consumes: `liquidity_pool::Pool`
- Produces: `place_bet(direction, window_secs, amount, nonce)` using pool accounts
- Produces: `settle_bet(odds_at_expiry_home)` using pool accounts

- [ ] **Step 1: Add dependency**

Modify `programs/betting-engine/Cargo.toml`:

```toml
liquidity_pool = { path = "../liquidity-pool", features = ["cpi"] }
```

- [ ] **Step 2: Update betting imports and constants**

In `programs/betting-engine/src/lib.rs`, replace the fixed payout constants block with:

```rust
use liquidity_pool::{Pool, FEE_SCALE};

const VALID_WINDOWS: [u32; 4] = [60, 300, 600, 900];
const MIN_BET_AMOUNT: u64 = 1_000_000; // 1 USDC (6 decimals)
const PAYOUT_NUMERATOR: u64 = 18;
const PAYOUT_DENOMINATOR: u64 = 10;
const PROTOCOL_FEE_BPS_SHARE: u64 = 2_500; // 25% of the fee, in bps
const BPS_DENOMINATOR: u64 = 10_000;
```

- [ ] **Step 3: Change `place_bet` accounting**

In `place_bet`, after validation and before writing `bet`, calculate:

```rust
let pool = &mut ctx.accounts.pool;
require!(pool.match_id == match_account.match_id, BettingError::PoolMatchMismatch);
require!(pool.mint == ctx.accounts.mint.key(), BettingError::PoolMintMismatch);
require!(pool.total_shares > 0, BettingError::NoLiquidity);

let fee = amount
    .checked_mul(pool.fee_rate as u64)
    .ok_or(BettingError::MathOverflow)?
    .checked_div(BPS_DENOMINATOR)
    .ok_or(BettingError::MathOverflow)?;
let protocol_fee = fee
    .checked_mul(PROTOCOL_FEE_BPS_SHARE)
    .ok_or(BettingError::MathOverflow)?
    .checked_div(BPS_DENOMINATOR)
    .ok_or(BettingError::MathOverflow)?;
let lp_fee = fee.checked_sub(protocol_fee).ok_or(BettingError::MathOverflow)?;
let effective_amount = amount.checked_sub(fee).ok_or(BettingError::MathOverflow)?;
let payout = effective_amount
    .checked_mul(PAYOUT_NUMERATOR)
    .ok_or(BettingError::MathOverflow)?
    .checked_div(PAYOUT_DENOMINATOR)
    .ok_or(BettingError::MathOverflow)?;

let available_liquidity = pool
    .total_liquidity
    .checked_sub(pool.locked_liquidity)
    .ok_or(BettingError::MathOverflow)?;
require!(available_liquidity >= payout, BettingError::InsufficientLiquidity);
```

Set `bet.payout = payout`, then after the SPL transfer:

```rust
pool.total_liquidity = pool
    .total_liquidity
    .checked_add(amount)
    .ok_or(BettingError::MathOverflow)?;
pool.locked_liquidity = pool
    .locked_liquidity
    .checked_add(payout)
    .ok_or(BettingError::MathOverflow)?;
pool.protocol_fees_accumulated = pool
    .protocol_fees_accumulated
    .checked_add(protocol_fee)
    .ok_or(BettingError::MathOverflow)?;
pool.fees_per_share = pool
    .fees_per_share
    .checked_add(
        (lp_fee as u128)
            .checked_mul(FEE_SCALE)
            .ok_or(BettingError::MathOverflow)?
            .checked_div(pool.total_shares as u128)
            .ok_or(BettingError::MathOverflow)?,
    )
    .ok_or(BettingError::MathOverflow)?;
```

- [ ] **Step 4: Replace `PlaceBet` accounts**

Replace escrow accounts in `PlaceBet` with pool accounts:

```rust
#[account(mut, has_one = mint, has_one = vault)]
pub pool: Account<'info, Pool>,

#[account(
    seeds = [b"vault", pool.match_id.as_bytes()],
    bump = pool.vault_authority_bump,
    seeds::program = liquidity_pool::id(),
)]
/// CHECK: PDA authority for the liquidity pool vault token account.
pub vault_authority: UncheckedAccount<'info>,

#[account(mut)]
pub vault: Account<'info, TokenAccount>,
```

Remove `associated_token_program` from `PlaceBet`, because the pool vault must already exist.

- [ ] **Step 5: Change `settle_bet` accounting**

In `settle_bet`, add pool validation and unlock liquidity before payout transfer:

```rust
let pool = &mut ctx.accounts.pool;
require!(pool.match_id == bet.match_id, BettingError::PoolMatchMismatch);
require!(pool.mint == ctx.accounts.mint.key(), BettingError::PoolMintMismatch);

pool.locked_liquidity = pool
    .locked_liquidity
    .checked_sub(bet.payout)
    .ok_or(BettingError::MathOverflow)?;
```

If won, transfer from pool vault to user using liquidity-pool PDA seeds:

```rust
let match_id = bet.match_id.as_bytes();
let seeds: &[&[u8]] = &[b"vault", match_id, &[pool.vault_authority_bump]];
let signer_seeds = &[seeds];
```

After successful payout transfer:

```rust
pool.total_liquidity = pool
    .total_liquidity
    .checked_sub(bet.payout)
    .ok_or(BettingError::MathOverflow)?;
```

- [ ] **Step 6: Replace `SettleBet` accounts**

Replace escrow accounts in `SettleBet` with:

```rust
#[account(mut, has_one = mint, has_one = vault)]
pub pool: Account<'info, Pool>,

#[account(
    seeds = [b"vault", pool.match_id.as_bytes()],
    bump = pool.vault_authority_bump,
    seeds::program = liquidity_pool::id(),
)]
/// CHECK: PDA authority for the liquidity pool vault token account.
pub vault_authority: UncheckedAccount<'info>,

#[account(mut)]
pub vault: Account<'info, TokenAccount>,
```

- [ ] **Step 7: Add betting errors**

Add to `BettingError`:

```rust
#[msg("Pool match does not match bet match")]
PoolMatchMismatch,
#[msg("Pool mint does not match token mint")]
PoolMintMismatch,
#[msg("Pool does not have liquidity")]
NoLiquidity,
#[msg("Pool does not have enough unlocked liquidity")]
InsufficientLiquidity,
#[msg("Math overflow")]
MathOverflow,
```

- [ ] **Step 8: Update betting tests**

In `programs/betting-engine/tests/test_betting.rs`:

- Load `liquidity_pool.so` in `setup()`.
- Add helper builders for `create_pool_ix` and `deposit_ix`.
- Before each successful bet, create a pool and deposit enough USDC.
- Update `build_place_bet_ix` to pass `pool`, pool vault authority, and pool vault.
- Update `build_settle_bet_ix` to pass `pool`, pool vault authority, and pool vault.
- Replace escrow balance assertions with pool vault and `Pool` account assertions.
- Add a rejection test for empty/insufficient pool liquidity.

Use these expected numeric assertions for a `100 * ONE_USDC` bet at fee 2%:

```rust
let fee = 2 * ONE_USDC;
let effective = 98 * ONE_USDC;
let payout = effective * 18 / 10;
assert_eq!(bet.payout, payout);
assert_eq!(pool.locked_liquidity, payout);
assert_eq!(pool.protocol_fees_accumulated, fee / 4);
```

- [ ] **Step 9: Run focused tests**

Run:

```bash
anchor build
cargo test -p betting_engine
```

Expected: PASS with existing betting tests updated for pool-backed flow.

- [ ] **Step 10: Commit**

```bash
git add programs/betting-engine/Cargo.toml programs/betting-engine/src/lib.rs programs/betting-engine/tests/test_betting.rs
git commit -m "feat: back betting engine with liquidity pool"
```

---

### Task 4: Implement Withdraw and Claim Fees

**Files:**
- Modify: `programs/liquidity-pool/src/lib.rs`
- Modify: `programs/liquidity-pool/tests/test_liquidity_pool.rs`

**Interfaces:**
- Produces: `withdraw(shares: u64)`
- Produces: `claim_fees()`
- Produces: internal pending-fee calculation using `fees_per_share`

- [ ] **Step 1: Add helper functions**

Add below `checked_u128_to_u64`:

```rust
pub fn pending_fees(pool: &Pool, lp_position: &LpPosition) -> Result<u64> {
    let delta = pool
        .fees_per_share
        .checked_sub(lp_position.fees_claimed_per_share)
        .ok_or(LiquidityPoolError::MathOverflow)?;
    checked_u128_to_u64(
        delta
            .checked_mul(lp_position.shares as u128)
            .ok_or(LiquidityPoolError::MathOverflow)?
            .checked_div(FEE_SCALE)
            .ok_or(LiquidityPoolError::MathOverflow)?,
    )
}
```

- [ ] **Step 2: Add `claim_fees` instruction**

Add to `pub mod liquidity_pool`:

```rust
pub fn claim_fees(ctx: Context<ClaimFees>) -> Result<()> {
    let pending = pending_fees(&ctx.accounts.pool, &ctx.accounts.lp_position)?;
    ctx.accounts.lp_position.fees_claimed_per_share = ctx.accounts.pool.fees_per_share;

    if pending == 0 {
        return Ok(());
    }

    let match_id = ctx.accounts.pool.match_id.as_bytes();
    let seeds: &[&[u8]] = &[
        b"vault",
        match_id,
        &[ctx.accounts.pool.vault_authority_bump],
    ];
    let signer_seeds = &[seeds];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.owner_token_account.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            },
            signer_seeds,
        ),
        pending,
    )?;

    ctx.accounts.pool.total_liquidity = ctx
        .accounts
        .pool
        .total_liquidity
        .checked_sub(pending)
        .ok_or(LiquidityPoolError::MathOverflow)?;

    Ok(())
}
```

- [ ] **Step 3: Add `withdraw` instruction**

Add to `pub mod liquidity_pool`:

```rust
pub fn withdraw(ctx: Context<Withdraw>, shares: u64) -> Result<()> {
    require!(shares > 0, LiquidityPoolError::WithdrawTooSmall);
    require!(
        ctx.accounts.lp_position.shares >= shares,
        LiquidityPoolError::InsufficientShares
    );

    let pending = pending_fees(&ctx.accounts.pool, &ctx.accounts.lp_position)?;
    let withdraw_amount = checked_u128_to_u64(
        (shares as u128)
            .checked_mul(ctx.accounts.pool.total_liquidity as u128)
            .ok_or(LiquidityPoolError::MathOverflow)?
            .checked_div(ctx.accounts.pool.total_shares as u128)
            .ok_or(LiquidityPoolError::MathOverflow)?,
    )?;
    let total_transfer = withdraw_amount
        .checked_add(pending)
        .ok_or(LiquidityPoolError::MathOverflow)?;
    let available = ctx
        .accounts
        .pool
        .total_liquidity
        .checked_sub(ctx.accounts.pool.locked_liquidity)
        .ok_or(LiquidityPoolError::MathOverflow)?;
    require!(total_transfer <= available, LiquidityPoolError::InsufficientLiquidity);

    ctx.accounts.lp_position.shares = ctx
        .accounts
        .lp_position
        .shares
        .checked_sub(shares)
        .ok_or(LiquidityPoolError::MathOverflow)?;
    ctx.accounts.lp_position.fees_claimed_per_share = ctx.accounts.pool.fees_per_share;
    ctx.accounts.pool.total_shares = ctx
        .accounts
        .pool
        .total_shares
        .checked_sub(shares)
        .ok_or(LiquidityPoolError::MathOverflow)?;
    ctx.accounts.pool.total_liquidity = ctx
        .accounts
        .pool
        .total_liquidity
        .checked_sub(total_transfer)
        .ok_or(LiquidityPoolError::MathOverflow)?;

    let match_id = ctx.accounts.pool.match_id.as_bytes();
    let seeds: &[&[u8]] = &[
        b"vault",
        match_id,
        &[ctx.accounts.pool.vault_authority_bump],
    ];
    let signer_seeds = &[seeds];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.owner_token_account.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            },
            signer_seeds,
        ),
        total_transfer,
    )?;

    Ok(())
}
```

- [ ] **Step 4: Add account structs**

Add:

```rust
#[derive(Accounts)]
pub struct ClaimFees<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(mut, has_one = mint, has_one = vault)]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        seeds = [b"lp", pool.key().as_ref(), owner.key().as_ref()],
        bump = lp_position.bump,
    )]
    pub lp_position: Account<'info, LpPosition>,

    pub mint: Account<'info, Mint>,

    #[account(
        seeds = [b"vault", pool.match_id.as_bytes()],
        bump = pool.vault_authority_bump,
    )]
    /// CHECK: PDA authority for the pool vault token account.
    pub vault_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = owner_token_account.owner == owner.key(),
        constraint = owner_token_account.mint == mint.key(),
    )]
    pub owner_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(mut, has_one = mint, has_one = vault)]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        seeds = [b"lp", pool.key().as_ref(), owner.key().as_ref()],
        bump = lp_position.bump,
    )]
    pub lp_position: Account<'info, LpPosition>,

    pub mint: Account<'info, Mint>,

    #[account(
        seeds = [b"vault", pool.match_id.as_bytes()],
        bump = pool.vault_authority_bump,
    )]
    /// CHECK: PDA authority for the pool vault token account.
    pub vault_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = owner_token_account.owner == owner.key(),
        constraint = owner_token_account.mint == mint.key(),
    )]
    pub owner_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}
```

- [ ] **Step 5: Add tests**

Add tests to `programs/liquidity-pool/tests/test_liquidity_pool.rs`:

| Test | Setup | Action | Exact assertions |
|---|---|---|---|
| `test_withdraw_unlocked_liquidity` | Create pool, mint `10_000 * ONE_USDC` to LP, deposit all | Call `withdraw_ix(lp, mint, MATCH_ID, 5_000 * ONE_USDC)` | LP token balance increases by `5_000 * ONE_USDC`; pool `total_liquidity == 5_000 * ONE_USDC`; pool `total_shares == 5_000 * ONE_USDC`; LP position `shares == 5_000 * ONE_USDC` |
| `test_rejects_withdraw_more_than_shares` | Create pool, deposit `10_000 * ONE_USDC` | Call `withdraw_ix(lp, mint, MATCH_ID, 10_001 * ONE_USDC)` | Error string contains `InsufficientShares`; pool `total_liquidity == 10_000 * ONE_USDC` |
| `test_rejects_zero_share_withdraw` | Create pool, deposit `10_000 * ONE_USDC` | Call `withdraw_ix(lp, mint, MATCH_ID, 0)` | Error string contains `WithdrawTooSmall` |
| `test_claim_fees_after_bet_accounting` | After Task 3 helpers are available, create pool, deposit `10_000 * ONE_USDC`, place `100 * ONE_USDC` bet through `betting-engine` | Call `claim_fees_ix(lp, mint, MATCH_ID)` | LP token balance increases by `1_500_000`; pool `protocol_fees_accumulated == 500_000`; LP position `fees_claimed_per_share == pool.fees_per_share` |
| `test_withdraw_rejects_locked_liquidity` | After Task 3 helpers are available, create pool, deposit `10_000 * ONE_USDC`, place open `5_000 * ONE_USDC` bet | Call `withdraw_ix(lp, mint, MATCH_ID, 10_000 * ONE_USDC)` | Error string contains `InsufficientLiquidity`; pool `locked_liquidity > 0` |

Add these instruction builders using the same style as `deposit_ix`:

```rust
fn claim_fees_ix(owner: &Pubkey, mint: &Pubkey, match_id: &str) -> Instruction {
    let pool = pool_pda(match_id);
    let lp_position = lp_position_pda(&pool, owner);
    let vault_authority = vault_authority(match_id);
    let vault = get_associated_token_address(&vault_authority, mint);
    let owner_token_account = get_associated_token_address(owner, mint);

    Instruction::new_with_bytes(
        liquidity_pool::id(),
        &liquidity_pool::instruction::ClaimFees {}.data(),
        liquidity_pool::accounts::ClaimFees {
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

fn withdraw_ix(owner: &Pubkey, mint: &Pubkey, match_id: &str, shares: u64) -> Instruction {
    let pool = pool_pda(match_id);
    let lp_position = lp_position_pda(&pool, owner);
    let vault_authority = vault_authority(match_id);
    let vault = get_associated_token_address(&vault_authority, mint);
    let owner_token_account = get_associated_token_address(owner, mint);

    Instruction::new_with_bytes(
        liquidity_pool::id(),
        &liquidity_pool::instruction::Withdraw { shares }.data(),
        liquidity_pool::accounts::Withdraw {
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
```

- [ ] **Step 6: Run pool tests**

Run:

```bash
anchor build
cargo test -p liquidity_pool
```

Expected: PASS for pool deposit, withdraw, and claim tests.

- [ ] **Step 7: Commit**

```bash
git add programs/liquidity-pool/src/lib.rs programs/liquidity-pool/tests/test_liquidity_pool.rs
git commit -m "feat: add liquidity pool withdrawals and fees"
```

---

### Task 5: Update Backend Account Builders

**Files:**
- Modify: `backend/src/solana.js`
- Modify: `backend/test/solana.test.js`

**Interfaces:**
- Consumes: pool PDA `["pool", match_id]`
- Consumes: pool vault authority PDA `["vault", match_id]` under `liquidity_pool` program id
- Produces: `place_bet` and `settle_bet` backend transactions using pool accounts

- [ ] **Step 1: Add config/program id support**

In `backend/src/config.js`, ensure a liquidity pool program id is read from env:

```js
liquidityPoolProgramId: process.env.LIQUIDITY_POOL_PROGRAM_ID,
```

- [ ] **Step 2: Add PDA helpers**

In `backend/src/solana.js`, add:

```js
export function derivePoolAddress(matchId, liquidityPoolProgramId) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), Buffer.from(matchId)],
    new PublicKey(liquidityPoolProgramId),
  )[0];
}

export function derivePoolVaultAuthority(matchId, liquidityPoolProgramId) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), Buffer.from(matchId)],
    new PublicKey(liquidityPoolProgramId),
  )[0];
}
```

- [ ] **Step 3: Replace escrow derivations**

In backend builders for `place_bet` and `settle_bet`, replace:

```js
deriveEscrowAuthority(matchId, bettingProgramId)
```

with:

```js
derivePoolVaultAuthority(matchId, liquidityPoolProgramId)
```

and include `pool` and pool vault accounts in the same order as the updated Anchor IDL.

- [ ] **Step 4: Update tests**

In `backend/test/solana.test.js`, assert:

```js
expect(derivePoolAddress("match_1", LIQUIDITY_POOL_PROGRAM_ID).toBase58()).toBeTruthy();
expect(derivePoolVaultAuthority("match_1", LIQUIDITY_POOL_PROGRAM_ID).toBase58()).toBeTruthy();
```

Update any `escrow` naming expectations to `poolVault`.

- [ ] **Step 5: Run backend tests**

Run:

```bash
cd backend && npm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/config.js backend/src/solana.js backend/test/solana.test.js
git commit -m "feat: build backend pool-backed betting accounts"
```

---

### Task 6: Final Verification and Docs

**Files:**
- Modify: `docs/fase-2a-pool-deposit.md`
- Modify: `docs/fase-2b-pool-integration.md`
- Modify: `docs/fase-2c-withdraw-fees.md`
- Modify: `docs/localnet.md`

**Interfaces:**
- Consumes: all completed implementation tasks
- Produces: updated Phase 2 evidence and localnet runbook

- [ ] **Step 1: Run Rust formatting**

Run:

```bash
cargo fmt --all
```

Expected: no output or formatting-only changes.

- [ ] **Step 2: Run Anchor build**

Run:

```bash
anchor build
```

Expected: PASS for all three programs.

- [ ] **Step 3: Run full Rust test suite**

Run:

```bash
cargo test
```

Expected: PASS for oracle, betting, and liquidity-pool tests.

- [ ] **Step 4: Run backend tests**

Run:

```bash
cd backend && npm test
```

Expected: PASS.

- [ ] **Step 5: Update Phase 2 docs**

Mark checkboxes in:

```txt
docs/fase-2a-pool-deposit.md
docs/fase-2b-pool-integration.md
docs/fase-2c-withdraw-fees.md
```

Add an evidence table to each:

```markdown
## Evidencia No Codigo

| Arquivo | O que valida |
|---|---|
| `programs/liquidity-pool/src/lib.rs` | Pool, deposit, withdraw, fee accounting |
| `programs/liquidity-pool/tests/test_liquidity_pool.rs` | Rust tests for pool flows |
| `programs/betting-engine/src/lib.rs` | Bets use pool vault and accounting |
| `programs/betting-engine/tests/test_betting.rs` | Betting integration with pool |
```

- [ ] **Step 6: Update localnet runbook**

In `docs/localnet.md`, add:

```markdown
| `liquidity_pool` | `<program id from Anchor.toml>` |
```

Add pool setup to smoke test:

```bash
anchor keys sync
anchor build
anchor deploy
```

- [ ] **Step 7: Inspect final diff**

Run:

```bash
git status --short
git diff --stat
```

Expected: only Phase 2 implementation, tests, backend helper updates, and docs.

- [ ] **Step 8: Commit**

```bash
git add programs/liquidity-pool programs/betting-engine backend docs/fase-2a-pool-deposit.md docs/fase-2b-pool-integration.md docs/fase-2c-withdraw-fees.md docs/localnet.md Anchor.toml Cargo.lock
git commit -m "docs: mark phase 2 liquidity pool complete"
```

- [ ] **Step 9: Verify commit signature**

Run:

```bash
git log -1 --pretty=fuller --show-signature
```

Expected:

```txt
Good signature from "olivmath-oken <lucas.oliveira@onepercent.io>"
Author:     olivmath-oken <lucas.oliveira@onepercent.io>
Commit:     olivmath-oken <lucas.oliveira@onepercent.io>
```
