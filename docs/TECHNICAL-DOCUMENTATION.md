# FutOdds / oddsdex — Technical Documentation

> Binary options on live football odds — Solana × TxODDS
> World Cup Hackathon 2026 — Superteam / TxODDS
> Generated on 2026-07-19 from the current state of the repository.

---

## Table of Contents

1. [Overview](#1-overview)
2. [System Architecture](#2-system-architecture)
3. [Smart Contracts (Solana / Anchor)](#3-smart-contracts-solana--anchor)
4. [Backend (Node.js / Express)](#4-backend-nodejs--express)
5. [Backoffice Console (`app/`)](#5-backoffice-console-app)
6. [Mobile App (`mobile-seeker/`)](#6-mobile-app-mobile-seeker)
7. [Website (`website/`)](#7-website-website)
8. [End-to-End Flows](#8-end-to-end-flows)
9. [Environments and Deployments](#9-environments-and-deployments)
10. [Testing](#10-testing)
11. [Known Limitations and Divergences](#11-known-limitations-and-divergences)
12. [Development Guide](#12-development-guide)

---

## 1. Overview

### 1.1 The product

**FutOdds** (product brand: **oddsdex**) is a platform for *binary options on sports-odds movement*. Users do not bet on the match result — they bet on whether a team's **live odd** will go **UP** or **DOWN** within a fixed time window (1, 5, 10 or 15 minutes). Liquidity is provided by LPs (liquidity providers) who deposit USDC into per-match pools and earn fees.

- **Settlement:** in USDC, on-chain, on Solana.
- **Odds feed:** TxODDS / TxLINE (real market data), with a synthetic odds fallback (`random`) for development/demo.
- **Custody:** non-custodial — users sign their own transactions (Phantom/Solflare on web; Mobile Wallet Adapter / Seed Vault on Seeker). The backend only signs odds writes and settlements.

### 1.2 Repository components

| Directory | Component | Stack | State |
|---|---|---|---|
| `programs/oracle-adapter/` | On-chain odds oracle | Rust / Anchor 1.1.2 | Implemented and deployed (testnet) |
| `programs/betting-engine/` | Bets + liquidity pool | Rust / Anchor 1.1.2 | Implemented and deployed (testnet) |
| `programs/liquidity-pool/` | Standalone pool (scaffold) | Rust / Anchor 1.1.2 | Scaffold — **not used** by the betting flow |
| `backend/` | Admin API, odds poller, settlement worker, TxLINE integration | Node.js (ESM) + Express 4 | Implemented |
| `app/` | Operator backoffice/testnet console | Vite + React 18 + TS | Implemented |
| `mobile-seeker/` | Android app (Solana Seeker / dApp Store) | Kotlin + Jetpack Compose | Implemented as an odds *viewer* + wallet (trading disabled) |
| `website/` | Landing page + investor (LP) panel | Next.js 16 + React 19 + Tailwind v4 | Implemented |
| `docs/` | Phase plans, deploy guides | Markdown | — |

### 1.3 Architecture decisions (summary)

| Decision | Choice |
|---|---|
| Token | USDC (6 decimals; test mint on devnet/testnet) |
| Oracle | Backend as sole authority (`update_odds` signed by the backend keypair) |
| Odds on-chain | Only the current snapshot + bet entry/expiry (cheap) |
| Client realtime | Canonical Anchor events (`OddsUpdated`, `BetSettled`) via Solana RPC WebSocket `onLogs` — no custom backend WebSocket |
| Payout | Fixed 1.8× of the post-fee stake (dynamic payout by UP/DOWN ratio is a future phase) |
| Exposure limit | 80% of liquidity (phase 3b — planned, not yet in the program) |
| Fee | Per-pool, in bps (max 10%); split 25% protocol / 75% LPs |

### 1.4 Trust model

- **User signs:** `place_bet`, `create_pool`, `deposit`, `withdraw`, `claim_fees` (non-custodial).
- **Backend (authority) signs:** `update_odds`, `set_match_status`, `settle_bet`. Settlement trusts the `odds_at_expiry_home` value supplied by the backend — the program does **not** re-read the oracle at settle time. The model is explicitly "oracle = backend as sole authority" (hackathon MVP).

---

## 2. System Architecture

### 2.1 Component diagram

```
                        ┌──────────────────────┐
                        │   TxODDS / TxLINE    │
                        │  (sportsapi.txodds)  │
                        │  REST + SSE stream   │
                        └──────────┬───────────┘
                                   │ 1X2 snapshots / SSE per fixture
                                   ▼
┌───────────────────────────────────────────────────────────────┐
│                    BACKEND (Express, :8787)                   │
│  ┌────────────┐ ┌──────────────────┐ ┌────────────────────┐   │
│  │ Odds Poller│ │ Settlement Worker│ │ TxLINE Client/SSE  │   │
│  │ (60s)      │ │ (10s)            │ │ + Guest JWT        │   │
│  └─────┬──────┘ └────────┬─────────┘ └────────────────────┘   │
│        │ update_odds     │ settle_bet    REST API (CORS *)    │
│        │ (authority)     │ (authority)   /matches /pools ...  │
└────────┼─────────────────┼───────────────────┬────────────────┘
         ▼                 ▼                   │ REST (poll 2–10s)
┌───────────────────────────────────┐          │
│         SOLANA (testnet)          │          │
│ ┌──────────────┐ ┌─────────────┐  │   ┌──────┴───────────────────────┐
│ │oracle_adapter│ │betting_engine│ │   │          CLIENTS             │
│ │ Match PDA    │ │ Pool/Bet/Lp │  │   │ app/  — backoffice console   │
│ │ OddsUpdated  │ │ BetSettled  │  │   │ website/ — /investors (LP)   │
│ └──────┬───────┘ └──────┬──────┘  │   │ mobile-seeker/ — viewer+wallet│
└────────┼────────────────┼─────────┘   └──────┬───────────────────────┘
         │   Anchor events via RPC onLogs      │
         └─────────────────────────────────────┘
              (canonical realtime: "Program data:" logs)
```

### 2.2 Canonical realtime

Frontends do **not depend on a backend WebSocket**. The realtime flow is:

```
backend poller  → update_odds  → OddsUpdated event → client: connection.onLogs(oracle_adapter)
backend worker  → settle_bet   → BetSettled event  → client: connection.onLogs(betting_engine)
```

Clients decode `Program data:` log lines (base64 + 8-byte Anchor event discriminator) and, if an event cannot be decoded, fall back to refetching the on-chain accounts. The current mobile app uses backend REST polling only (2s), without `onLogs`.

### 2.3 Odds in basis points

All odds travel as **implied probability in basis points** (`u16`, required sum = **10000**). Example: `home=6500` ⇒ 65.00%. Conversion to the decimal odd displayed on mobile: `odd = 10000 / bps`. The `home + away + draw == 10000` invariant is validated both in the program (`InvalidOddsSum`) and in the clients.

---

## 3. Smart Contracts (Solana / Anchor)

### 3.1 Workspace

- **Anchor:** `anchor-lang = 1.1.2` (feature `init-if-needed`); `anchor-spl = 1.1.2` in betting-engine and liquidity-pool.
- **Rust:** `1.89.0` (pinned in `rust-toolchain.toml`); edition 2021; release profile with `overflow-checks = true`, `lto = "fat"`.
- **Tests:** LiteSVM 0.10.0 via `cargo test` (the `Anchor.toml` test script); there are no TS/mocha tests.
- **Provider cluster:** `testnet`; wallet `~/.config/solana/id.json`; `skip_local_validator = true`.

**Program IDs** (each program's `declare_id!` = the testnet ID):

| Program | Localnet | Testnet (`declare_id!`) |
|---|---|---|
| `oracle_adapter` | `HwDVX9fTTxmnLBJwtig7ugsWuiqLh14pj71WtxQaaSSa` | `Df1gfgegKEBJvKtyHdxUiwaohUkDQj9Pigdpgszk7XUL` |
| `betting_engine` | `67mbZdR3KxZxRxgKDMT7JbxtYU92C1y81Q4KKGQRkMMY` | `H3ekojbWVFfzYnTmiNUejMkiB2pEQuf6wyH7QyyMQkz1` |
| `liquidity_pool` | `3wdXrPtrpX44sAhfZbK9MJVTwQ2ufai8pQ1C8TVHPexV` | `3jeWz6WQaM8DG5jRqoVff4FtsMVRjg9peGGMjjgUYRMY` |

> There is also a **hackathon demo deployment** referenced in the root README and in the console (`app/`) defaults: oracle `6BVWCCQDjQDcjQYhmbzJ9DFWY9LyDojM3mYoWivrASaG`, betting `GoccKzkMS5BWRmrbLdGKzqKUUcksZB3DftW82F7boCoQ`. See §11.3 on the program-ID divergence across components.

### 3.2 `oracle-adapter`

On-chain 1X2 odds feed (home/away/draw in bps) + match status. Written by the authority (backend), read by `betting-engine`.

#### Instructions

**`update_odds(match_id: String, odds_home: u16, odds_away: u16, odds_draw: u16, tag: String)`**
- Validation: `odds_home + odds_away + odds_draw == 10000` (u32), else `InvalidOddsSum`.
- `match_account`: `init_if_needed`, payer = authority, seeds `[b"match", match_id]`, constraint `authority == Pubkey::default() || authority == signer` (else `Unauthorized`).
- Behavior: a new match is detected via `authority == Pubkey::default()` — in that case it stores the authority, `match_id` and `status = Open`. The `tag` is only overwritten when the match is new or the incoming tag is non-empty (odds-only updates preserve the tag). Updates the 3 odds and `updated_at` (Clock). Emits `OddsUpdated`.

**`set_match_status(match_id: String, status: MatchStatus)`**
- Constraint: `match_account.authority == signer` (else `Unauthorized`).
- Updates `status` and `updated_at`. Used by the backend to close matches (`Closed = 1`).

#### `MatchAccount` — seeds `[b"match", match_id]`

| Field | Type | Bytes |
|---|---|---|
| `authority` | `Pubkey` | 32 |
| `match_id` | `String` (max 36) | 4+36 |
| `tag` | `String` (max 64) | 4+64 |
| `odds_home` / `odds_away` / `odds_draw` | `u16` ×3 | 6 |
| `updated_at` | `i64` | 8 |
| `status` | `MatchStatus` (`Open=0`, `Closed=1`) | 1 |
| `bump` | `u8` | 1 |

Total with discriminator: **164 bytes**. ⚠️ The program **deployed on testnet** still has the legacy layout with 1 extra trailing byte (`OddsSource`) — **165 bytes**; see §3.5.

#### Event and errors

- **`OddsUpdated`** `{ authority, match_id, tag, odds_home, odds_away, odds_draw, updated_at }` — discriminator `[156,39,18,117,46,12,46,218]`.
- **`OracleError`:** `Unauthorized`, `InvalidOddsSum` ("Odds must sum to 10000"), `InvalidMatchStatus` (declared, unused).

### 3.3 `betting-engine`

Binary UP/DOWN bets on the movement of the **home odd** (`odds_home`) over a fixed window, with a per-match liquidity pool (shares + fee accrual) embedded in the program itself. It reads the oracle's `MatchAccount` via *account-type sharing* (`use oracle_adapter::MatchAccount`, dependency with the `cpi` feature) — an ownership-checked typed read, **not an instruction CPI**. The only real CPI is into SPL Token (vault transfers).

#### Constants

```
VALID_WINDOWS            = [60, 300, 600, 900]  // seconds
MIN_BET_AMOUNT           = 1_000_000            // 1 USDC (6 decimals)
MIN_DEPOSIT_AMOUNT       = 1_000_000            // 1 USDC
MAX_FEE_RATE             = 1_000                // 10.00% in bps
PAYOUT_NUM/DEN           = 18 / 10              // fixed payout: 1.8× post-fee stake
BPS_DENOMINATOR          = 10_000
PROTOCOL_FEE_BPS_SHARE   = 2_500                // 25% of the fee → protocol; 75% → LPs
FEE_SCALE                = 1_000_000_000_000    // fixed point (u128) for fees_per_share
```

#### Instructions

**`create_pool(match_id: String, fee_rate: u16)`** — signed by any user (becomes `pool.authority`).
- Validation: `fee_rate <= 1000` (`InvalidFeeRate`).
- Creates the `Pool` (seeds `[b"pool", match_id]`), the `vault_authority` PDA (seeds `[b"vault", match_id]`) and the `vault` (USDC ATA whose authority is `vault_authority`). Initializes all counters to zero.

**`deposit(amount: u64)`** — signed by the LP.
- Validation: `amount >= 1 USDC` (`DepositTooSmall`).
- Shares: first deposit → `shares = amount`; afterwards → `shares = amount × total_shares / total_liquidity` (checked u128).
- Creates/updates the `LpPosition` (seeds `[b"lp", pool, owner]`, `init_if_needed`) with `fees_claimed_per_share = pool.fees_per_share` (fee checkpoint). Transfers USDC owner → vault; `total_liquidity += amount`, `total_shares += shares`.

**`place_bet(direction: u8, window_secs: u32, amount: u64, nonce: u32)`** — signed by the user.
- Validations: `direction ∈ {0=Up, 1=Down}` (`InvalidDirection`); `window_secs ∈ VALID_WINDOWS` (`InvalidWindow`); `amount >= 1 USDC` (`BetTooSmall`); `pool.match_id == match_account.match_id` (`PoolMatchMismatch`); `pool.mint == mint` (`PoolMintMismatch`); `pool.total_shares > 0` (`NoLiquidity`); `total_liquidity − locked_liquidity >= payout` (`InsufficientLiquidity`).
- Math:
  ```
  fee          = amount × fee_rate / 10000
  protocol_fee = fee × 2500 / 10000
  lp_fee       = fee − protocol_fee
  effective    = amount − fee
  payout       = effective × 18 / 10        // 1.8×
  ```
- Creates the `Bet` (seeds `[b"bet", match_id, user, nonce_le]`) with `odds_at_entry = match_account.odds_home`, `expires_at = created_at + window_secs`, `status = 0 (Open)`. Transfers the full `amount` user → vault. Pool: `total_liquidity += amount`; `locked_liquidity += payout`; `protocol_fees_accumulated += protocol_fee`; `lp_fees_accumulated += lp_fee`; `fees_per_share += lp_fee × FEE_SCALE / total_shares`.
- Only `odds_home` drives pricing; `odds_away`/`odds_draw` are stored but unused by the engine.

**`settle_bet(odds_at_expiry_home: u16)`** — signed by the match authority (backend).
- Validations: `signer == bet.authority` (`Unauthorized`); `bet.status == 0` (`BetAlreadySettled`); `clock >= bet.expires_at` (`BetNotExpired`); pool/mint mismatches as above.
- Outcome: UP wins if `odds_at_expiry_home > odds_at_entry`; DOWN wins if `<`; equality = bettor loss.
- Always `locked_liquidity −= payout`. Win → `status=1`, PDA-signed vault → user transfer of `payout` (seeds `[b"vault", match_id, vault_authority_bump]`), `total_liquidity −= payout`. Loss → `status=2` (stake stays in the pool). Emits `BetSettled`.
- ⚠️ `odds_at_expiry_home` is **supplied by the backend**, not read from the oracle (MVP trust model).

**`claim_fees()`** — signed by the LP.
- `pending = (fees_per_share − fees_claimed_per_share) × shares / FEE_SCALE`; updates the checkpoint; if > 0, transfers vault → owner and applies `total_liquidity −= pending`, `lp_fees_accumulated −= pending`.

**`withdraw(shares: u64)`** — signed by the LP.
- Validations: `shares > 0` (`WithdrawTooSmall`); `lp_position.shares >= shares` (`InsufficientShares`); `total_transfer <= total_liquidity − locked_liquidity` (`InsufficientLiquidity`).
- Math: `principal = total_liquidity − protocol_fees_accumulated − lp_fees_accumulated`; `withdraw_amount = shares × principal / total_shares`; `total_transfer = withdraw_amount + pending_fees`. Burns shares, updates the checkpoint and transfers `total_transfer` from the vault (PDA-signed).

> **There is no `cancel_bet`** in the current program (phase 3c planned, not implemented).

#### Accounts

**`Bet`** — seeds `[b"bet", match_id, user, nonce.to_le_bytes()]`, **157 bytes** with discriminator:
`user: Pubkey`, `authority: Pubkey`, `match_id: String(36)`, `direction: u8`, `odds_at_entry: u16`, `amount: u64`, `payout: u64`, `window_secs: u32`, `created_at: i64`, `expires_at: i64`, `status: u8` (0 Open / 1 Won / 2 Lost; the UI reserves 3 = Cancelled), `nonce: u32`, `bump: u8`.

**`Pool`** — seeds `[b"pool", match_id]`, ≈212 bytes:
`authority`, `match_id: String(36)`, `mint`, `vault`, `total_liquidity: u64`, `locked_liquidity: u64`, `fee_rate: u16`, `protocol_fees_accumulated: u64`, `lp_fees_accumulated: u64`, `fees_per_share: u128`, `total_shares: u64`, `bump`, `vault_authority_bump`. The `vault` is an SPL ATA owned by the `vault_authority` PDA (seeds `[b"vault", match_id]`).

**`LpPosition`** — seeds `[b"lp", pool, owner]`, ≈105 bytes:
`owner`, `pool`, `shares: u64`, `deposited_at: i64`, `fees_claimed_per_share: u128`, `bump`.

#### Event and errors

- **`BetSettled`** `{ authority, user, match_id, bet, direction, odds_at_entry, odds_at_expiry_home, status, won, settled_at }` — discriminator `[57,145,224,160,62,119,227,206]`.
- **`BettingError`:** `InvalidDirection`, `InvalidWindow`, `BetTooSmall`, `BetNotExpired`, `BetAlreadySettled`, `Unauthorized`, `InvalidFeeRate`, `DepositTooSmall`, `WithdrawTooSmall`, `InsufficientShares`, `PoolMatchMismatch`, `PoolMintMismatch`, `NoLiquidity`, `InsufficientLiquidity`, `MathOverflow`.

Instruction discriminators used by clients (no IDL): `place_bet` `[222,62,67,220,63,166,126,33]`, `create_pool` `[233,146,209,142,207,104,64,188]`, `deposit` `[242,35,198,137,82,225,242,182]` (plus `update_odds`, `settle_bet`, `withdraw`, `claim_fees` encoded in `backend/src/solana.js`, `app/src/solanaBackoffice.ts` and `website/lib/solana.ts`).

### 3.4 `liquidity-pool` (scaffold)

A standalone program with only `create_pool(match_id, fee_rate)` and `deposit(amount)` — same share math as the betting-engine, same seed strings (`[b"pool"]`, `[b"vault"]`, `[b"lp"]`) but **under a different program ID** (different addresses). **There is no `withdraw`/`claim_fees`** (capital would be locked) and **no runtime relationship with the betting-engine**, which re-implements Pool/LpPosition internally. Kept as an isolated scaffold/study; the errors `WithdrawTooSmall`, `InsufficientShares`, `InsufficientLiquidity`, `NoLpShares` are declared but unused. This program's `Pool` account has no `lp_fees_accumulated` field.

### 3.5 Compatibility with the legacy deployment (`OddsSource` byte)

Commit `02db358` removed the `OddsSource` enum from the oracle contract (the odds source became a backend-only concept, with 3 modes — see §4.4). However, **the program deployed on testnet still has the old layout**, with an `OddsSource` byte after `status`. The backend bridges both:

- `MATCH_ACCOUNT_SIZE = 165` in the backend (vs the 164 the current source compiles to);
- when decoding, the legacy byte is mapped `1 → "txline-polling"`, otherwise `"random"`;
- when encoding `update_odds`, 1 extra byte is appended: `random → 0`, `txline-polling`/`txline-realtime` → `1` (both TxLINE modes collapse into the single legacy `Txline` variant).

Related commits: `ea66b60` (deployed layout support), `eb7ca68` (versioned match accounts), `c761811` (live TxLINE participant odds mapping).

---

## 4. Backend (Node.js / Express)

### 4.1 Overview

A Node.js service (ESM, no framework beyond Express 4) that concentrates three roles:

1. **Admin/read REST API** (default port `8787`, CORS `Access-Control-Allow-Origin: *`, no authentication on any route);
2. **Odds Poller** — syncs open matches from chain, fetches/generates odds and sends `update_odds`;
3. **Settlement Worker** — scans expired bets and sends `settle_bet`.

Dependencies: `@solana/web3.js ^1.98.4`, `express ^4.19.2`, `eventsource ^4.1.0` (TxLINE SSE), `tweetnacl` (activation-script signature). npm scripts: `dev` (`node --watch`), `dev:local` / `start:local` (loads `.env.local`), `start:testnet` (loads `.env.testnet`), `test` (`node --test`).

`createRuntime()` (in `server.js`) wires everything: loads `AppConfig`, the authority keypair, `createStore()`, the TxLINE client, the SSE stream (with an `onDisconnect` handler that marks active streams as `paused`), the poller and the worker. `syncMatches()` fetches all open `MatchAccount`s on-chain and **filters to matches whose authority == the backend keypair**. Startup runs `initialize()` (first sync) and then `app.listen`.

### 4.2 Configuration (`appConfig.js` — singleton, validated at boot)

**Required** (boot fails if missing): `SOLANA_RPC_URL`, `ORACLE_KEYPAIR` (keypair path, `~` expanded), `ORACLE_PROGRAM_ID`, `BETTING_PROGRAM_ID`, `TXLINE_API_ORIGIN`, `TXLINE_GUEST_JWT`, `TXLINE_API_TOKEN`.

**Optional (default):** `PORT` (8787), `TEST_USDC_MINT` (`CDAQWBQ3DciCWQDtyczAWvTp3xuyuL2t273LSdffjxB`), `ODDS_POLL_INTERVAL_MS` (60000), `SETTLEMENT_INTERVAL_MS` (10000), `TXLINE_SUPER_ODDS_TYPE` (`1X2`), `TXLINE_MARKET_PERIOD` (`FullTime`), `TXLINE_COMPETITION_ID`, `TXLINE_START_EPOCH_DAY`.

**Activation script only:** `ANCHOR_PROVIDER_URL`, `ANCHOR_WALLET`, `TXLINE_SERVICE_LEVEL_ID` (1), `TXLINE_DURATION_WEEKS` (4), `TXLINE_SELECTED_LEAGUES`, `TXLINE_SUBSCRIBE_TX`.

### 4.3 HTTP routes

| Method/Route | Description |
|---|---|
| `GET /health` | Health check (renders runtime status: RPC, authority, store) |
| `GET /status` | Store state: poller/settlement (`running`, `lastRunAt`), matches (+`fixtureId`, `streamStatus`), last 20 txs and errors |
| `GET /matches` | Match list (id, tag, odds in bps, status, `oddsSource`, `streamStatus`, `updatedAt`) — consumed by mobile/console |
| `POST /matches` | Creates a match: body `{matchId, fixtureId?, tag?, oddsSource?}`. Validates `oddsSource ∈ {random, txline-polling, txline-realtime}`; for TxLINE modes validates the `fixtureId` against the fixtures snapshot and fetches initial 1X2 odds (502 if none); neutral odds default `3334/3333/3333`. Sends `update_odds` (authority) and records source/fixture in the store |
| `POST /matches/:matchId/source` | Switches the match's odds mode at runtime (3-mode validation) |
| `POST /matches/:matchId/close` | Sends `set_match_status(Closed)` |
| `GET /pools` | Reads on-chain `Pool`s (`fetchPoolState`) and enriches with tag/odds/status from the store (`live` if stream active, `open`, `settled` if the match is gone) + metadata (`poolsMeta`: cluster, mint, program) |
| `GET /pools/positions/:owner` | Owner's LP positions: pool, matchId, shares, `depositedAt`, `pendingFees` (same `fees_per_share` math as the program, `FEE_SCALE = 1e12`, BigInt) |
| `GET /leagues` | Supported leagues (`SoccerSupportedLeagues.csv`) |
| `GET /fixtures?competitionId=` | Proxy of the TxLINE fixtures snapshot (503 if credentials not configured) |
| `POST /poller/start` · `/poller/stop` | Starts/stops the odds poller |
| `POST /settlement/start` · `/stop` · `/run-once` | Controls the settlement worker (`run-once` returns `{checked, settled, failed}`) |
| `POST /stream/start/:matchId` | Activates the match stream. If `txline-realtime`: connects the SSE (if needed) and registers a per-fixture callback that writes `Prices[0..2]` → `latestOdds` in the store. Sets `streamStatus = active` |
| `POST /stream/stop/:matchId` | `streamStatus = inactive`; removes the callback; disconnects the SSE if no active fixtures remain |
| `POST /stream/resume/:matchId` | Only allowed from `paused` (set automatically when the SSE drops); reconnects and reactivates |
| `GET /stream/status` | `{connected, activeFixtures, streams[]}` |

Global error handler: records in the store + logger and responds `500 {error}`.

### 4.4 The 3 odds modes (`oddsSource`)

The mode is **per match**, controlled only in the backend (in-memory store), switchable at runtime via `POST /matches/:id/source` or the console's Game Admin tab:

| Mode | Behavior |
|---|---|
| `random` | The poller generates a random walk: drift `±200` bps per side (`(Math.random()−0.5)×400`), floor 500 bps, renormalized to sum 10000. Initial base `3334/3333/3333` |
| `txline-polling` | The poller fetches a TxLINE 1X2 snapshot by `fixtureId` each cycle and pushes it on-chain |
| `txline-realtime` | The poller **skips** the match; odds arrive via SSE (`/api/odds/stream`) and are cached in `latestOdds`; the server's realtime path publishes them |

### 4.5 Odds Poller (`oddsPoller.js`)

Every `ODDS_POLL_INTERVAL_MS` (default 60s): syncs on-chain matches → for each match (except `txline-realtime`): resolves odds per mode → `sendUpdateOdds(matchId, odds, oddsSource)` (with the legacy byte, §3.5) → records the tx (`update_odds`) and the `oracle.updated` log. Errors are recorded per match without killing the cycle.

### 4.6 Settlement Worker (`settlementWorker.js`)

Every `SETTLEMENT_INTERVAL_MS` (default 10s): `fetchOpenBets()` (scan of 157-byte `Bet` accounts) → for each bet with `status == 0` and `expiresAt <= now`: takes the match's current odds from the store and calls `settleBet(bet, match.odds.home)` → records a `settle_bet` tx. Individual failures don't interrupt the batch; returns `{checked, settled, failed}`.

### 4.7 TxLINE (TxODDS) integration

- **`txlineClient.js`** — authenticated REST with `Authorization: Bearer <guestJwt>` + `X-Api-Token`. `fetchFixturesSnapshot({competitionId})` and `fetchOddsSnapshot(fixtureId)`. On `401`, renews the guest JWT **once** and retries; other HTTP errors are surfaced.
- **`txlineOdds.js`** (`selectTxlineOdds`) — maps the snapshot to `{home, away, draw}` in bps: uses the `1X2` market (`FullTime` period), with an implied-probability fallback; accepts participant/result aliases; rounds so the sum is exactly 10000; rejects non-1X2 markets.
- **`txlineStream.js`** — SSE (`eventsource`) on `/api/odds/stream` with the same headers; per-`FixtureId` callbacks; on error, disconnects and fires `onDisconnect` (which marks active streams as `paused`, enabling `/stream/resume`).
- **`scripts/txline-activate-devnet.js`** — one-shot activation of the feed credentials on **devnet**: (1) a `subscribe` transaction against the TxLINE program `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J` (Token-2022, mint `4Zao...okRG`, `pricing_matrix` and `token_treasury_v2` PDAs); (2) `POST /auth/guest/start` → guest JWT; (3) signs `"{txSig}:{leagues}:{jwt}"` with `nacl.sign.detached` and `POST /api/token/activate`; (4) prints `TXLINE_API_ORIGIN/GUEST_JWT/API_TOKEN/SUBSCRIBE_TX` ready to paste into `.env`.

### 4.8 Store (`store.js`)

**In-memory** state (lost on restart): matches (on-chain mirror + metadata), `matchSources`, `matchFixtures`, `matchStreamStatus` (`active|paused|inactive`), `matchLatestOdds` (cache), poller/settlement flags with `lastRunAt`, and circular lists (limit 20) of `txs` and `errors`. `replaceMatches()` preserves known source/fixture/stream when re-syncing (source default: `random`).

### 4.9 Solana layer (`solana.js`)

- Loads the authority keypair from `ORACLE_KEYPAIR`.
- **Builders** (hardcoded discriminators, no IDL): `buildUpdateOddsInstruction` (+ legacy source byte), `buildSettleBetInstruction` (10-byte data: disc + `odds_at_expiry_home` u16LE), `set_match_status`, test-USDC faucet (mint_to + lamports).
- **Decoders/scans:** `fetchOpenMatches` (dataSize **165**, restores `fixtureId` from versioned matchIds), `fetchOpenBets` (dataSize **157**, filters `status == 0`), `fetchPoolState` (splits `Pool` × `LpPosition` by discriminator), bet/match/pool/lp decoding and BigInt `pendingFees`.

### 4.10 Logger (`logger.js`)

Logger with a **critical-event allowlist** — only these are emitted (everything else is silently dropped): `game.created`, `admin.match.create`, `admin.match.source`, `stream.started`, `stream.stopped`, `stream.resumed`, `stream.error`, `oracle.updated`, `settlement.executed`, `error.fatal`, `app.started`, `poller.tick`, `poller.started`. Levels `info`/`error`.

---

## 5. Backoffice Console (`app/`)

A Vite + React 18 + TypeScript SPA (`futodds-backoffice`), Portuguese UI, aimed at the **operator** (testnet). It talks to the backend REST API **and** directly to a Solana RPC. Deps: `@solana/web3.js`, `recharts`, `buffer`. Tests with vitest + testing-library.

### 5.1 Configuration (`solanaBackoffice.ts`, Vite env)

| Variable | Default |
|---|---|
| `VITE_SOLANA_RPC_URL` | `https://api.testnet.solana.com` |
| `VITE_TEST_USDC_MINT` | `CDAQWBQ3DciCWQDtyczAWvTp3xuyuL2t273LSdffjxB` |
| `VITE_BACKEND_URL` | `http://localhost:8787` |
| `VITE_ORACLE_PROGRAM_ID` | `6BVWCCQDjQDcjQYhmbzJ9DFWY9LyDojM3mYoWivrASaG` (demo deploy) |
| `VITE_BETTING_PROGRAM_ID` | `GoccKzkMS5BWRmrbLdGKzqKUUcksZB3DftW82F7boCoQ` (demo deploy) |

⚠️ The console uses `MATCH_ACCOUNT_SIZE = 164` (new layout) while the backend uses 165 (deployed layout) — the defaults point at different deployments and must be pinned via env for consistency (§11.3).

### 5.2 Tabs and features

Tabs: **games** · **create** · **pool** · **bet** · **game-admin**. Header with Backend/Poller status, total staked and open bets; footer with RPC/programs/last event.

- **Refresh (10s):** `Promise.allSettled` of `GET /health`, `/status`, `/matches` + `getProgramAccounts` on the oracle (dataSize 164) and betting program (dataSize 157); merged into `GameRow[]` with a source badge (backend | chain | backend+chain).
- **Create game:** calls the backend `POST /matches` (authority signs); supports all 3 modes and a `TxlineFixturePicker` (via `GET /fixtures`, grouped by competition).
- **Bet:** builds `place_bet` client-side (creates the vault ATA if needed, checks the user's USDC balance), signs with the **browser wallet** (Phantom/Solflare via `window.solana`/`window.solflare`) and sends a raw tx. UP(0)/DOWN(1), windows 60/300/600/900s, 1 USDC minimum.
- **Pool:** `create_pool` (fee 1–1000 bps) and `deposit`, wallet-signed. Includes `buildMintToInstruction` (opcode 7) to mint test USDC.
- **Game Admin:** per-match dashboard — score/stream status, Recharts odds-over-time chart, pool TVL/fee, bet counters, START/STOP/RESUME/CLOSE controls (`/stream/*` routes and `/matches/:id/close`), event log. Subscribes `connection.onLogs(match.pda)` and polls `/status` every 5s.

### 5.3 Anchor event realtime parser

`parseAnchorEventFromLogs` — scans transaction log lines for the `"Program data: "` prefix, base64-decodes, matches the 8-byte event discriminator and decodes **`OddsUpdated`** and **`BetSettled`** (Borsh-style length-prefixed strings). Malformed logs return `null` (covered by a test). Consumed by two `connection.onLogs` subscriptions (commitment `confirmed`): on the oracle program (optimistic odds patch in the table, without waiting for the 10s poll) and on the betting program (triggers a `refresh()`), keeping the last 20 events.

---

## 6. Mobile App (`mobile-seeker/`)

A native Android app (Kotlin + Jetpack Compose) for the **Solana Seeker / dApp Store**. In its current state it is a **live odds viewer + wallet connection + USDC balance reader** — trading is explicitly disabled in the UI ("Trading is not enabled… won't simulate") and **there is no transaction building/signing and no program call** in the current code.

### 6.1 Identity and build

- `applicationId`: `com.oddsdex.app` (devnet flavor: `.devnet`); version `0.1.0` (code 1).
- minSdk 31 · target/compileSdk 35 · JVM 17 · AGP 8.8.0 · Kotlin 2.1.0 · Gradle 8.11.1.
- **Flavors (`cluster` dimension):**
  - `devnet` → `CLUSTER="devnet"`, RPC `https://api.devnet.solana.com`, `USDC_MINT=CDAQ...jxB` (test mint);
  - `mainnet` → `CLUSTER="mainnet-beta"`, mainnet RPC, real USDC `EPjF...Dt1v`.
- Backend: Gradle prop `oddsdexApiBaseUrl` → env `BACKEND_URL` → default `http://18.191.145.46:8787`. Cleartext HTTP denied globally except for that IP (`network_security_config.xml`). Only permission: `INTERNET`.
- Key deps: Compose BOM 2024.12.01 + Material3, Hilt 2.53.1, Ktor 3.0.3 (okhttp/json), kotlinx-serialization, security-crypto (EncryptedSharedPreferences), Solana Mobile `mobile-wallet-adapter-clientlib-ktx 2.0.3`, `web3-solana 0.2.5`, `rpc-core 0.2.7`, `multimult` (Base58). Release build with minify+shrink+proguard.

### 6.2 Architecture and navigation

Packages: `api/` (BackendApi, SolanaRpcApi), `core/` (Hilt AppModule, Analytics), `data/` (MatchRepository, BackendTickSource, MatchMapper), `domain/` (TickSource, OddsTick, Direction), `wallet/` (WalletSessionManager, AuthTokenStore), `ui/` (home, onboarding, profile, chart, components, theme).

**Navigation is plain Compose state (no NavHost):** `MainActivity` → no connected wallet → **ReadyScreen** (connect); with wallet → **HomeScreen** with `TERMINAL | GAMES | HISTORY` tabs (Material3 NavigationBar) + a **ProfileScreen** overlay (AnimatedVisibility + BackHandler). Disconnecting returns to ReadyScreen.

### 6.3 Screens

- **ReadyScreen** — single onboarding screen: "Connect to FutOdds" title, gradient CTA → Mobile Wallet Adapter.
- **Terminal (HomeScreen)** — full-screen live odds chart with overlays: TopBar (profile, mono USDC balance, refresh), MatchHeader (pulsing LIVE dot, `home × away`, HOME/AWAY toggle that switches the observed series), catalog states (loading/error/empty), "Trading unavailable" card.
- **GamesScreen** — Live/Upcoming lists; Live shows `MatchRow` (mono decimal odd, green when selected) → selects and opens the Terminal; Upcoming is a placeholder.
- **HistoryScreen** — fully built UI (P&L, win rate, trades, UP/DOWN rows) but **always empty** — `state.history` is never populated (awaits a backend positions endpoint).
- **ProfileScreen** — avatar, abbreviated address with copy, Seeker badge (`Build.MODEL == "Seeker"`), network `Solana · ${CLUSTER}`, Disconnect.

### 6.4 Data layer (odds flow)

```
GET /matches (+ /fixtures once)            GET /matches (2s)
   MatchRepository ── 5s ──> catalog ──> BackendTickSource ──> OddsTick ──> SeriesBuffer(400) ──> OddsChart
   (filters status==0 && oddsSource txline*)  (dedup by server updatedAt)                        (draw-only, no recomposition)
```

- **BackendApi** (Ktor): `GET /matches`, `GET /fixtures`, `POST /stream/start/{id}`, `POST /stream/stop/{id}` (when switching the watched match). Timeouts 4s/8s.
- **SolanaRpcApi**: read-only JSON-RPC — `getTokenAccountsByOwner` by USDC mint, sums balances (wallet balance).
- **BackendTickSource** (`TickSource`): 2s loop; requires `oddsSource` starting with `txline`; converts bps→decimal odd (`10000/bps`); **only emits a tick when the server timestamp advances** (never fabricates data — the "no synthetic odds" principle); states `CONNECTING/LIVE/ERROR`.
- **MatchMapper**: `decimalOdd`, team-name resolution (fixture > participant orientation > tag separators > id convention > raw title).
- **SeriesBuffer**: synchronized ring buffer, capacity 400 (parallel double/long arrays), `snapshotInto` with zero per-frame allocation.
- **OddsChart**: custom Canvas with a `withFrameNanos` loop (invalidates draw only); critically-damped spring (ω=16 rad/s) at the head, max 400ms extrapolation between ticks, 45s visible window, head pinned at 62% width, exponential range smoothing (τ=0.30s); line and area **always cyan** `#41D9E8` (brand rule), value pill in JetBrains Mono, 240ms cross-fade on series switch.

### 6.5 Wallet (Mobile Wallet Adapter)

- **WalletSessionManager**: a single `MobileWalletAdapter` with identity `https://oddsdex.app` / "oddsdex"; blockchain `Solana.Devnet|Mainnet` per flavor; sealed result `Connected(address) | NoWalletFound | Failed`. Base58 address of the first account; silent reconnect via persisted `authToken`.
- **AuthTokenStore**: `EncryptedSharedPreferences` (AES256-GCM/SIV) for `auth_token` and `wallet_address`.
- **Custody**: signing happens 100% in the wallet app (Seed Vault on Seeker); no key material in-process. Minimal logcat analytics (`wallet_connected`/`wallet_disconnected`), never addresses.
- On an emulator a wallet must be installed (Solana Mobile's fakewallet recommended; Phantom/Solflare on devnet).

### 6.6 Design system — "Volt Court" brand (`mobile-seeker/brand.md`)

The brand source of truth, reused **verbatim** by the website (never fork the palette). Dark-first, near-black with a pitch-green tint (`#081310` — never `#000`), surfaces `#0F1E18`/`#14261F`, text `#F0F5F2`/`#85948B`.

**The dopamine rule (non-negotiable):** electric green `#2FE083` **only** on CTAs / UP / wins / payouts — never ambient; red `#FA5A6A` only on DOWN/losses; **chart line always cyan** `#41D9E8` (data-neutral) before settlement. CTA gradient `#00E5C9 → #2FE083`. Typography: **Inter** (UI) + **JetBrains Mono** (all numbers, tabular). Never rely on color alone (pair ↑/↓ icons/labels). Launch language pt-BR (source strings in English, full `values-pt-rBR` — "SOBE/DESCE", "AO VIVO").

---

## 7. Website (`website/`)

A **Next.js 16 (App Router) + React 19 + Tailwind CSS v4** project. Two distinct surfaces: a static marketing homepage and a **functional investor (LP) panel**.

### 7.1 Stack and configuration

- `next 16.2.10`, `react 19.2.4`, TypeScript 5, `tailwindcss ^4` (CSS-first `@theme`, no `tailwind.config.js`).
- Solana: raw `@solana/web3.js ^1.98.4` + `buffer` — **no wallet-adapter, no Anchor client** (hardcoded discriminators mirroring the program).
- Fonts via `next/font/google`: Inter (`--font-inter`) + JetBrains Mono (`--font-jetbrains-mono`).
- Env: `NEXT_PUBLIC_BACKEND_URL` (default `http://localhost:8787`; `.env.example` points at `https://18.191.145.46:3000`), optional `NEXT_PUBLIC_SOLANA_RPC_URL`.
- Deployed on **Vercel** (project `futodds`, `.vercel/project.json`). `next.config.ts` is default/empty.
- All animation is hand-rolled CSS keyframes + IntersectionObserver (`Reveal`); `prefers-reduced-motion` honored.

### 7.2 Homepage (`/`) — marketing, all static/mock

Render order: `Navbar → Hero → PhoneSection → BentoSection → TrustSection → InvestorSection → AwardsSection → Faq → Footer → CookieBanner`. Highlights:

- **Hero** — "Trade live odds with confidence"; "UP or DOWN on a live football odd. 60 seconds. Settled in USDC, on Solana."
- **LiveChart** — canvas odds chart (cyan `#41d9e8` line per the brand rule), tick math ported from the app's simulator (momentum + volatility clustering + mean reversion).
- **PhoneSection** — full phone mockup (balance, asset row, embedded LiveChart, UP/DOWN panel, gradient "Confirm UP").
- **BentoSection / TrustSection / InvestorSection / AwardsSection / Faq / Footer** — bento feature grid, "non-custodial" trust badges (Solana/USDC/Seed Vault/Open source/Devnet), 3-step LP explainer with the protocol stats (2.00% fee, 1.5/0.5 split, 80% max exposure, 60s window), fictional testimonials + hackathon milestone card, 6-question FAQ, footer with decorative QR and risk disclaimer.
- **CookieBanner** — dismissible, persisted in `localStorage` (`oddsdex-cookies-ok`).

### 7.3 Investor panel (`/investors`) — functional

- **`InvestorPanel.tsx`** — polls backend `GET /pools` every 10s; fetches `GET /pools/positions/:owner` on wallet connect. Header with cluster label, USDC balance, **Connect wallet** (Phantom `window.solana` / Solflare `window.solflare`). Stats strip (Total TVL / My positions / Claimable fees / Active pools) and a pools table (Match/Status/TVL/Locked/Unlocked%/My value) with status pills (live/open/settled); selecting a row opens `PoolDetail`.
- **`PoolDetail.tsx`** — deposit/withdraw/claim UI: metrics grid, locked-vs-unlocked exposure bar, "My position" (shares/value/pending fees + Claim fees), Deposit/Withdraw tabs with live share preview (`amount × total_shares ÷ total_liquidity`), min-deposit and balance/unlocked caps, full tx lifecycle banner (idle → building → pending → confirmed/error).
- **`lib/solana.ts`** — wallet connect, PDA derivations (`vault`, `lp`, ATA), raw `TransactionInstruction` builders for `deposit`/`withdraw`/`claim_fees` (hardcoded discriminators mirroring `programs/betting-engine`), `sendInstructions` (sign + confirm), `fetchTokenBalance`.
- **`lib/pools.ts`** — `Pool`/`LpPosition`/`PoolStatus` types mirroring the on-chain accounts (u64 as bigint) and share math identical to the program (`sharesForDeposit`, `positionValue`, `sharesForWithdrawAmount`, `sharePrice`, `unlockedRatio`, `availableLiquidity`), USDC 6-decimal helpers, `clusterLabel()`.

### 7.4 Branding

Volt Court tokens ported verbatim from `mobile-seeker/brand.md` into `app/globals.css` (`:root` + Tailwind v4 `@theme inline`): `bg #081310`, `surface #0f1e18`, `chip #14261f`, `fg #f0f5f2`, `muted #85948b`, `primary #2fe083`, `down #fa5a6a`, `series-cyan #41d9e8`, CTA gradient `#00e5c9 → #2fe083`. All numbers render in JetBrains Mono tabular (`.num`). Brand rules enforced in code: no pure `#000000`, chart line never green/red pre-settlement, green reserved for reward/action.

### 7.5 Plan files

- **`TODO-WEB.md`** — the original plan for a `web/` folder ("not started"); **superseded** by `website/` (English-only, no framer-motion/shadcn, no real screenshots).
- **`TO-DO-Website.md`** — the current plan (2026-07-19), status "implementado". Genuinely open items: swap raw web3.js for wallet-adapter + Anchor IDL once the pool program is finalized on devnet, and the QA pass (360px legibility, Lighthouse ≥95). Several unchecked boxes are stale — the corresponding sections are already built.

---

## 8. End-to-End Flows

### 8.1 Creating a match (operator)

```
Console "create" tab ──POST /matches {matchId, fixtureId, tag, oddsSource}──> Backend
  Backend: validates mode → (TxLINE modes) validates fixture + fetches initial 1X2 odds
         → sends update_odds (authority signs; init_if_needed creates the Match PDA)
         → stores oddsSource/fixtureId in the store
  On-chain: Match PDA created, OddsUpdated emitted → console patches its table via onLogs
```

### 8.2 Live odds (per mode)

```
random:           poller (60s) → random walk ±200 bps → update_odds → OddsUpdated
txline-polling:   poller (60s) → TxLINE snapshot 1X2  → update_odds → OddsUpdated
txline-realtime:  TxLINE SSE → store.latestOdds cache → realtime path publishes
                  (poller skips; SSE drop ⇒ streamStatus=paused ⇒ POST /stream/resume)
```

Consumers: console via `onLogs` + 10s refresh; mobile via `GET /matches` 2s polling (server-timestamp dedup); website `/investors` via `GET /pools` 10s polling.

### 8.3 Bet lifecycle

```
1. LP:    create_pool(match_id, fee_rate) + deposit(amount)        [user-signed]
2. User:  place_bet(direction, window, amount, nonce)              [user-signed]
        → fee split (25% protocol / 75% LPs), payout = 1.8× locked, stake → vault
3. Time passes (60/300/600/900s) … poller keeps updating odds
4. Backend settlement worker (10s): finds expired open bets
        → settle_bet(current home odds)                            [authority-signed]
        → win: vault → user payout · loss: stake stays in the pool
        → BetSettled event → clients update via onLogs
```

### 8.4 LP lifecycle (website `/investors`)

```
Connect wallet → GET /pools + /pools/positions/:owner
Deposit  → deposit ix (raw web3.js, user-signed) → shares minted pro-rata
Earn     → each bet accrues lp_fee via fees_per_share (FEE_SCALE 1e12)
Claim    → claim_fees ix → pending fees paid from the vault
Withdraw → withdraw ix → principal pro-rata + pending fees (capped by unlocked liquidity)
```

---

## 9. Environments and Deployments

### 9.1 Environment matrix

| Component | Dev/local | Deployed |
|---|---|---|
| Programs | localnet (`solana-test-validator`; see `docs/localnet.md`, `docs/reset-localnet-setup.md`) | Solana **testnet** |
| Backend | `npm run dev:local` (`.env.local`) | AWS EC2 `18.191.145.46:8787` (plan: ECS Fargate — `docs/aws-deploy-backend-data.md`) |
| Console | `npm run dev` (Vite :5173) | — (operator tool) |
| Website | `next dev` | Vercel (project `futodds`) |
| Mobile | `installDevnetDebug` (devnet flavor) | Solana dApp Store target (Seeker) |
| TxLINE | credentials activated on devnet via `scripts/txline-activate-devnet.js` | `https://sportsapi.txodds.com` |

### 9.2 Testnet deployment evidence (hackathon demo, from README)

| Program | Program ID | Slot | Size |
|---|---|---:|---:|
| `oracle_adapter` | `6BVWCCQDjQDcjQYhmbzJ9DFWY9LyDojM3mYoWivrASaG` | 422618831 | 166,424 B |
| `betting_engine` | `GoccKzkMS5BWRmrbLdGKzqKUUcksZB3DftW82F7boCoQ` | 422627116 | 225,632 B |

Authority: `CvReCDqGVKDU9i1ZF8WZy1NUbdZrZVs423FPFiNB3kyj`. Verify:

```bash
solana program show 6BVWCCQDjQDcjQYhmbzJ9DFWY9LyDojM3mYoWivrASaG --url https://api.testnet.solana.com
solana program show GoccKzkMS5BWRmrbLdGKzqKUUcksZB3DftW82F7boCoQ --url https://api.testnet.solana.com
```

### 9.3 Shared addresses

| Item | Address |
|---|---|
| Test USDC mint (devnet/testnet) | `CDAQWBQ3DciCWQDtyczAWvTp3xuyuL2t273LSdffjxB` |
| Real USDC mint (mainnet, mobile flavor) | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| TxLINE subscription program (devnet) | `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J` |

### 9.4 AWS plan (`docs/aws-deploy-backend-data.md`)

Recommended stack: Amplify Hosting (frontend), **ECS Fargate / ECS Express Mode** (backend — a long-running poller fits a persistent container, not Lambda; App Runner avoided as it closes to new customers in April 2026), DynamoDB (`MatchConfig`, `BackendTx` documents), Secrets Manager/SSM (keypair, TxLINE tokens), CloudWatch, GitHub Actions → ECR → ECS.

---

## 10. Testing

| Layer | Framework | Coverage |
|---|---|---|
| Programs (3×) | Rust + LiteSVM (`cargo test`) | oracle: odds create/update/auth/invalid-sum; betting: full E2E `update_odds → place_bet → settle_bet` incl. 7 settlement scenarios, pool create/deposit, guards; liquidity-pool: 5 isolated create/deposit tests |
| Backend | `node --test` (10 files) | CORS/routes/3-mode validation, `/pools` merge + positions with pending fees, account decoding (157/165 layouts, legacy byte), poller mode selection, settlement filtering + failure isolation, TxLINE client 401-renewal, 1X2 mapping + rounding-to-10000, store, logger allowlist, config |
| Console | vitest + testing-library | view-model (rows/parsers/formatters/readiness), instruction encoding + PDA derivation, event-log parse tolerance, component tests (StreamControls, GameScore, GameAdminTab, etc.) |
| Mobile | JUnit | `MatchMapperTest` (decimal odd, team-name precedence, live mapping), `BackendTickSourceTest` (timestamp parsing: unix s/ms, ISO-8601) |
| Website | — | no automated tests (ESLint only) |

---

## 11. Known Limitations and Divergences

### 11.1 Product / roadmap gaps

- **Fixed 1.8× payout** — the dynamic payout by UP/DOWN ratio (phase 3a), the **80% exposure limit** (3b) and **`cancel_bet`** (3c) are documented in `docs/fase-3*.md` but not implemented in the program.
- **Mobile trading disabled** — the app is a viewer + wallet; `place_bet` via MWA, position history and log subscriptions are planned (its `ARCHITECTURE.md` is aspirational). `HistoryScreen` is built but permanently empty pending a positions endpoint.
- **Settlement trust** — `settle_bet` accepts the backend-supplied expiry odds; equality counts as a bettor loss; only `odds_home` is priced (away/draw stored but unused).
- **In-memory backend store** — sources/fixtures/stream state and tx/error history are lost on restart (DynamoDB persistence is planned in the AWS doc).
- **No API auth** — all backend routes, including admin ones (`/poller/*`, `/settlement/*`, `POST /matches`), are unauthenticated and CORS-open. Acceptable for a hackathon demo only.
- **`liquidity-pool` scaffold** — deposits could not be withdrawn if it were used; it is not wired into the betting flow.

### 11.2 Technical caveats

- Clients (backend, console, website) encode instructions with **hardcoded Anchor discriminators** instead of a generated IDL/wallet-adapter — the planned migration is noted in `TO-DO-Website.md`.
- The deployed oracle uses the **legacy 165-byte layout**; the current source compiles to 164. The backend bridges it (§3.5), but the console assumes 164 — mixed deployments will silently miss accounts if the sizes don't match.
- `GET /stream/status` filters `oddsSource === "txline"`, which matches neither `txline-polling` nor `txline-realtime` — the `streams[]` list is effectively always empty (the per-match `streamStatus` in `/status` is the reliable source).
- In the betting-engine, `token::transfer` is invoked passing `token_program.key()` (a `Pubkey`) as the CPI program argument — unusual for anchor-spl 1.1.2; worth verifying.
- The Game Admin tab reads `poolTvl`/`feeRate`/`home_odds` fields the backend `/status` does not currently populate (they render as 0).

### 11.3 Program-ID / config divergence

Three different deployments coexist in defaults across the repo and must be pinned via env for a consistent stack:

| Component | Oracle default | Betting default |
|---|---|---|
| Programs source (`declare_id!`) / `.env.example` testnet | `Df1g...7XUL` | `H3ek...Qkz1` |
| Backend code defaults / `.env.example` localnet | `HwDV...aSSa` | `67mb...kMMY` |
| Console (`app/`) defaults / README demo evidence | `6BVW...ASaG` | `Gocc...boCoQ` |

---

## 12. Development Guide

### 12.1 Prerequisites

Rust 1.89.0 (pinned) · Solana CLI + Anchor CLI · Node.js (ESM) · Android Studio Ladybug+ / JDK 17 (mobile) · a funded wallet at `~/.config/solana/id.json`.

### 12.2 Common commands

```bash
# Programs
anchor build                 # builds the 3 programs
cargo test                   # LiteSVM tests (also `anchor test`)
cargo fmt --all && cargo clippy --workspace --all-targets

# Backend
cd backend && npm i
cp .env.example .env.local   # fill in RPC, keypair, program IDs, TxLINE creds
npm run dev:local            # http://localhost:8787
npm test

# Backoffice console
cd app && npm i && npm run dev        # http://127.0.0.1:5173 (VITE_* env to pin IDs)
npm test

# Website
cd website && npm i && npm run dev    # NEXT_PUBLIC_BACKEND_URL to point at the backend

# Mobile (devnet flavor)
cd mobile-seeker
./gradlew installDevnetDebug          # BACKEND_URL / -PoddsdexApiBaseUrl to override
./gradlew testDevnetDebugUnitTest lintDevnetDebug
```

### 12.3 Local loop (localnet)

See `docs/localnet.md` and `docs/reset-localnet-setup.md`: start `solana-test-validator`, deploy the programs, create the test USDC mint, run the backend with `.env.local` (localnet RPC + localnet program IDs), then drive the flow from the console (create match → pool → deposit → bet → wait for the window → settlement worker settles).

### 12.4 Conventions (`AGENTS.md`)

- Conventional Commits (`feat: …`, `fix: …`, `test: …`); commits/GitHub as `olivmath <olivmath@protonmail.com>`.
- Rust: rustfmt 4-space, snake_case modules, PascalCase accounts, SCREAMING_SNAKE_CASE constants, short stable PDA seeds (`b"match"`, `b"bet"`, `b"escrow"`), validation via `require!` next to the instruction.
- Tests named after behavior (`test_update_odds_rejects_invalid_sum`); run `cargo test` before PRs; `anchor build` when IDLs change.
- PRs: short behavior description + link to the phase doc (`Refs docs/fase-…`).

### 12.5 Further reading

- `ARCHITECTURE.md` — concept-level decisions, PDAs, dynamic payout formula, planned markets.
- `docs/fase-0…3c` — per-phase plans with test matrices and completion status.
- `docs/deploy-testnet-oracle.md` — oracle-only testnet deploy walkthrough.
- `docs/aws-deploy-backend-data.md` — production backend/data plan.
- `mobile-seeker/brand.md` — Volt Court brand source of truth (mobile + web).

