# Phase 2 Liquidity Pool Design

## Goal

Implement Phase 2 as the production liquidity model for FutOdds:

| Phase | Delivery |
|---|---|
| 2a | `liquidity-pool` program with pool creation, LP deposits, shares, and pool vault |
| 2b | `betting-engine` uses pool vault and pool liquidity instead of match escrow |
| 2c | LP withdrawals and fee claiming |

The Phase 1 escrow flow becomes historical. New bets must use pool-backed liquidity.

## Scope

| Included | Excluded |
|---|---|
| New Anchor program: `programs/liquidity-pool` | Mainnet deployment |
| Pool PDA and LP position PDA | Real USDC integration |
| Pool USDC ATA owned by a vault authority PDA | Dynamic payout from Phase 3 |
| Deposit shares, withdrawal, fee accounting | Exposure limits from Phase 3 |
| Betting-engine pool integration | User-facing app redesign |
| Rust tests for pool and betting integration | Changing oracle semantics |

## Program Boundaries

| Program | Responsibility |
|---|---|
| `oracle-adapter` | Stores match odds and emits odds events |
| `liquidity-pool` | Owns pool state, LP positions, vault authority, deposits, withdrawals, and fee claims |
| `betting-engine` | Creates bets and settles outcomes while mutating pool accounting through accounts passed into the instruction |

`betting-engine` will depend on `liquidity-pool` types directly, matching the existing `oracle_adapter` dependency pattern.

## Accounts

```rust
pub struct Pool {
    pub authority: Pubkey,
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

pub struct LpPosition {
    pub owner: Pubkey,
    pub pool: Pubkey,
    pub shares: u64,
    pub deposited_at: i64,
    pub fees_claimed_per_share: u128,
    pub bump: u8,
}
```

## PDA Seeds

| Account | Seeds |
|---|---|
| `Pool` | `["pool", match_id]` |
| `LpPosition` | `["lp", pool, owner]` |
| Pool vault authority | `["vault", match_id]` |
| Pool vault ATA | ATA of vault authority for pool mint |
| `Bet` | Existing `["bet", match_id, user, nonce]` |

## Instructions

| Instruction | Program | Behavior |
|---|---|---|
| `create_pool(match_id, fee_rate)` | `liquidity-pool` | Initializes pool and pool vault ATA |
| `deposit(amount)` | `liquidity-pool` | Transfers USDC into pool vault and mints LP shares in accounting |
| `withdraw(shares)` | `liquidity-pool` | Burns accounting shares and returns unlocked liquidity pro-rata |
| `claim_fees()` | `liquidity-pool` | Transfers pending LP fees pro-rata |
| `place_bet(...)` | `betting-engine` | Transfers user stake into pool vault, charges fee, locks payout liquidity |
| `settle_bet(...)` | `betting-engine` | Unlocks payout liquidity and pays winners from pool vault |

## Liquidity Math

### Deposits

```txt
first deposit:
  shares = amount

later deposits:
  shares = amount * total_shares / total_liquidity

after deposit:
  total_liquidity += amount
  total_shares += shares
```

### Betting Fee

```txt
fee = amount * pool.fee_rate / 10000
protocol_fee = fee * 25 / 100
lp_fee = fee - protocol_fee
effective_amount = amount - fee

pool.protocol_fees_accumulated += protocol_fee
pool.fees_per_share += lp_fee * 1_000_000_000_000 / total_shares
```

`pool.fee_rate = 200` means 2.00%.

### Payout

Phase 2 keeps the Phase 1 fixed payout:

```txt
payout = effective_amount * 18 / 10
```

Dynamic payout moves to Phase 3a.

### Locking

```txt
available = total_liquidity - locked_liquidity
require available >= payout
locked_liquidity += payout
```

On settlement:

```txt
locked_liquidity -= bet.payout

if won:
  transfer bet.payout from pool vault to user
  total_liquidity -= bet.payout

if lost:
  total_liquidity stays unchanged
```

The user's stake enters `total_liquidity` at placement. Winners remove payout liquidity from the pool; losers leave the stake for LPs.

### Withdraw

```txt
available = total_liquidity - locked_liquidity
withdraw_amount = shares * total_liquidity / total_shares
require withdraw_amount <= available

position.shares -= shares
pool.total_shares -= shares
pool.total_liquidity -= withdraw_amount
transfer withdraw_amount to LP
```

LPs should claim fees before or during withdraw so accumulated fees do not get stranded. The implementation may call the same internal fee settlement logic from both paths.

## Errors

| Error | Trigger |
|---|---|
| `InvalidFeeRate` | `fee_rate > 1000` |
| `DepositTooSmall` | deposit below 1 USDC |
| `WithdrawTooSmall` | zero-share withdraw |
| `InsufficientShares` | LP withdraws more shares than owned |
| `InsufficientLiquidity` | pool lacks unlocked liquidity for bet or withdraw |
| `NoLpShares` | fee distribution needs LP shares but none exist |
| `MathOverflow` | checked arithmetic fails |

## Tests

| Group | Cases |
|---|---|
| Pool 2a | create pool, first deposit, second LP deposit, reject small deposit, reject invalid fee |
| Betting 2b | place bet uses pool vault, fee charged, locked liquidity increases, reject empty pool, settle won pays from pool |
| Fees 2c | claim fee after bet, pro-rata fee split, withdraw unlocked liquidity, reject locked withdraw, E2E deposit → bet → settle → claim → withdraw |
| Regression | Existing oracle tests and betting validation tests still pass after account changes |

Expected final command:

```bash
cargo fmt --all
anchor build
cargo test
```

## Migration Notes

| Area | Action |
|---|---|
| Anchor workspace | Add `liquidity-pool` under `programs/*` |
| `Anchor.toml` | Add localnet program id after keys sync/build |
| `betting-engine` tests | Update account builders to pass pool, pool vault, and pool vault authority |
| Backend helpers | Update instruction builders that derive betting accounts |
| Docs | Mark Fase 2 criteria complete only after tests pass |

## Acceptance

Phase 2 is complete when:

| Requirement | Evidence |
|---|---|
| LP can create pool and deposit | Rust tests pass |
| Bets use pool vault | Betting integration test checks token balances |
| Pool locks/unlocks payout liquidity | Pool account assertions pass |
| LP can claim fees | Fee tests pass |
| LP can withdraw unlocked liquidity | Withdraw tests pass |
| Escrow path is removed from active bet flow | `betting-engine` no longer derives `["escrow", match_id]` |
