# PRD — FutOdds Protocol (backend + smart contracts)

**Document type:** Product Requirements — **scope: on-chain programs + off-chain backend only**
**Counterpart:** `mobile-seeker/PRD.md` (client app, owned by the other dev)
**Status:** Draft v0.1
**Last updated:** 2026-07-19

---

## 0. How to read this doc

This PRD covers the **protocol side**: the Anchor programs and the off-chain backend services. The mobile app is out of scope here — it consumes what this side exposes. The most important section is **§7 Interface contracts**: it mirrors §7 of the app PRD and is the handshake between both repos. Any change to those schemas is a cross-team decision.

---

## 1. Overview

### 1.1 Summary
FutOdds is **binary options on live football odds movements**. Users bet whether the decimal odd of a specific market selection will go **UP** or **DOWN** within a fixed time window (1/5/10/20 min), settled in **USDC** on **Solana**. Liquidity providers fund a per-match pool and earn fees; the protocol enforces risk limits on-chain.

The protocol side owns:
- **Custody, settlement, and payout** (Anchor programs)
- **The odds source of truth** (oracle authority writing TxODDS data on-chain)
- **Real-time distribution** (WebSocket streaming to clients)
- **Risk management** (exposure limits, dynamic payout)

### 1.2 Core mechanic
- Underlying: decimal odd of one selection (e.g. `1X2 → Home wins`), from **TxODDS/TxLINE**, updating in real time.
- Position: `direction (UP|DOWN)`, `stake (USDC)`, `window (1|5|10|20 min)`.
- Settlement at expiry: compare `odd_exit` vs `odd_entry` (both recorded on-chain by the oracle authority). Correct direction → `payout` from the pool vault; wrong → stake stays in the pool.
- **Verifiability is a hard requirement:** `odd_entry` and `odd_exit` live on-chain so the app can prove any result via the explorer.

### 1.3 Economic model (decided)
| Decision | Choice |
|---|---|
| Token | USDC |
| Matching model | **Pooled** — users bet against a per-match liquidity pool, not P2P |
| Payout | **Dynamic**, from UP/DOWN distribution, quoted at entry and fixed on the Bet PDA |
| Fee | 2% per bet → 0.5% protocol / 1.5% LPs (pro-rata) |
| Risk limit | Net exposure ≤ 80% of pool liquidity, enforced on-chain |
| Oracle | Backend keypair as sole authority (MVP); signed odds snapshots |

Dynamic payout formula (quoted by backend, enforced by program):

```
effective = stake × (1 − fee_rate)
UP bet:   payout = effective × (1 + total_down / (total_up + effective))
DOWN bet: payout = effective × (1 + total_up / (total_down + effective))
```

Exposure check at `place_bet`:

```
net_exposure = |exposure_up − exposure_down|
require(net_exposure + new_payout ≤ total_liquidity × 0.80)
```

---

## 2. Scope

### 2.1 In scope (this side)
**On-chain (Anchor):**
- `oracle-adapter`: odds snapshots on-chain, match lifecycle, match events
- `betting-engine`: place / settle / cancel bets, escrow, payout transfer
- `liquidity-pool`: pool per match, LP deposit/withdraw, share accounting, fee accrual, lock/unlock

**Off-chain (Rust backend):**
- Odds Poller — TxODDS/TxLINE ingestion (~5s poll + live WS)
- Oracle Writer — pushes snapshots via `update_odds` (authority keypair)
- Settlement Cron — scans expired bets, calls `settle_bet` with odds at expiry
- WebSocket Server — real-time odds + chart series to clients
- REST API — matches, quotes, positions (indexed from chain)
- Indexer — Bet/Pool PDA state + program events → queryable store
- Risk Engine — monitors exposure, can pause markets

### 2.2 Out of scope (app repo)
Everything client-side: UI, MWA/Seed Vault signing flow, optimistic state, charts. The app **builds and signs** `place_bet` transactions but never computes payout — it renders the quote from `GET /markets/{id}/quote`.

### 2.3 Out of scope (v2+)
Other sports; markets beyond odds direction (next goal, cards, corners — settled by TxLINE events); permissionless oracle; cash-out.

---

## 3. Assumptions and dependencies

| # | Assumption | Owner | Blocks |
|---|---|---|---|
| B1 | TxODDS/TxLINE credentials + stable feed (REST + WS) | TxODDS / hackathon | Everything |
| B2 | Oracle authority keypair secured (env/KMS, never in repo) | Us | Settlement integrity |
| B3 | USDC mint fixed per cluster (mainnet `EPjF…Dt1v`; devnet mock) | Us | Vault setup |
| B4 | App consumes quotes as-is and never derives payout | App dev | Quote contract |
| B5 | RPC + priority-fee budget adequate for settlement bursts | Us | Settlement SLA |

---

## 4. Users of this system

- **Bettor** (via app): places/receives — never calls the backend directly for money paths; only signs txs.
- **LP** (via app or CLI in MVP): deposits USDC into a match pool, earns 1.5% fee share, withdraws unlocked liquidity.
- **Protocol admin**: claims 0.5% protocol fee, pauses markets, rotates oracle authority.
- **The app** (machine user): consumes REST/WS/IDL surfaces in §7.

---

## 5. On-chain design

### 5.1 Programs and instructions

**oracle-adapter** (deployed on testnet — phase 0 done)
- `update_odds(match_id, odds_home, odds_away, odds_draw)` — authority-only, `init_if_needed` on Match PDA
- v2: `push_event(match_id, event_type, ts)` for goal/card markets

**betting-engine** (phases 1a/1b done)
- `place_bet(match_id, direction, window, amount)` — reads Match PDA odds, records `odds_at_entry`, escrows USDC, creates Bet PDA. With phase 2b/3a/3b: quotes dynamic payout, locks pool liquidity, enforces exposure.
- `settle_bet(bet)` — authority-only; compares Match PDA odds at expiry vs `odds_at_entry`; Won → transfer payout to user; Lost → release to pool + accrue fees.
- `cancel_bet(bet)` (phase 3c) — guards: `status == Open`, `now < expires_at`, signer is user or authority; refunds stake minus fee policy TBD.

**liquidity-pool** (phases 2a–2c, not built yet)
- `create_pool(match_id)` — vault (USDC token account) + Pool PDA
- `deposit(amount)` — mint LP shares pro-rata
- `withdraw(shares)` — burn shares, return unlocked USDC only
- `claim_fees()` — LP and protocol fee withdrawal

### 5.2 Accounts (PDAs)

```
Match        seeds ["match", match_id]
  authority, match_id, odds_home/away/draw (u16, 6500 = 65.00%),
  status (Upcoming|Live|Settled), updated_at, bump

Pool         seeds ["pool", match_id]
  total_liquidity, locked_liquidity, exposure_up, exposure_down,
  fee_rate (200 = 2%), accrued_lp_fees, accrued_protocol_fees,
  vault (USDC ATA), lp_mint, bump

Bet          seeds ["bet", match_id, user, nonce]
  user, direction (Up|Down), window, amount, payout,
  odds_at_entry, odds_at_expiry, created_at, expires_at,
  status (Open|Won|Lost|Cancelled), bump
```

LP shares are an SPL mint (`lp_mint`), not a vec — scales and composes with wallets.

### 5.3 Events (Anchor `emit!`)
`OddsUpdated`, `BetPlaced`, `BetSettled { bet, result, payout }`, `BetCancelled`, `PoolDeposited`, `PoolWithdrawn` — the app subscribes to logs for real-time settlement UX; the indexer consumes the same events.

### 5.4 Security invariants (violating these is a critical bug)
- Only the oracle authority can write odds or settle.
- `settle_bet` only after `expires_at`, using odds with `updated_at ≥ expires_at` (first snapshot at/after expiry).
- Escrowed USDC leaves the vault only via settle (payout) or cancel (refund).
- `withdraw` never touches `locked_liquidity`.
- All amount math is checked (`checked_*`); overflow = reject.
- Exposure check runs before any state mutation in `place_bet`.

---

## 6. Backend services

| Service | Responsibility | SLA |
|---|---|---|
| Odds Poller | TxODDS REST poll ~5s + TxLINE WS; normalize decimal→bps; snapshot store | feed lag < 2s |
| Oracle Writer | Debounced `update_odds` per match (write on meaningful delta or every N s) | on-chain lag < 10s |
| WS Server | `SUB match:{id}:market:{id}` → snapshot + deltas; server `ts`; `open|suspended|closed` status | client latency < 1s |
| REST API | §7.1 endpoints; quotes computed from live pool state | p95 < 300ms |
| Settlement Cron | Every ~5s: find `Open` bets past expiry → `settle_bet`; retry with backoff; idempotent | settle < 30s after expiry |
| Indexer | Subscribe program logs + account changes → Postgres; serves `/positions` | lag < 5s |
| Risk Engine | Watch exposure/liquidity; set market `suspended` (stops quoting) when limits near | — |

Suspension rule (decided, answers app PRD §5.4/§10): on TxLINE suspension (goal/VAR), the market stops accepting **new** bets; **open positions keep running** — settlement uses the first oracle snapshot at/after expiry. If no snapshot lands within a grace window (feed dead), the bet is cancelled and the stake refunded.

Tie rule (decided): `odd_exit == odd_entry` → **refund stake minus fee** (bet neither won nor lost; fee compensates LPs for locked liquidity).

Slippage rule (decided): payout is **locked at entry** on the Bet PDA. The odd registered on-chain at `place_bet` is the entry; the app shows the registered value in the result screen. No rejection window in MVP.

---

## 7. Interface contracts (mirror of app PRD §7 — keep in sync)

### 7.1 REST
```
GET /matches?status=live|upcoming
GET /matches/{id}
GET /markets/{id}/quote        → { multiplier, min_stake, max_stake, timeframes[] }
GET /positions?wallet={pubkey}
GET /positions/{id}            → includes odd_entry, odd_exit, result, tx sig
```
`quote` is the only payout source the app may display. Quotes are indicative; the program is the enforcer.

### 7.2 WebSocket
```
SUB match:{id}:market:{id} → { selection_id, odd, ts, movement, status }
```
Snapshot on SUB, deltas after; auto-reconnect supported; `ts` is server time.

### 7.3 On-chain surface for the app
- Versioned IDLs published per release (`target/idl/*.json` committed or hosted)
- Documented PDA seeds (§5.2) so the app can derive accounts without the indexer
- Events (§5.3) for log subscriptions
- USDC mint per cluster documented in `docs/`

MVP stake limits: min 1 USDC, max 100 USDC. Timeframes: 1/5/10/20 min. (App PRD open question §16.8 — closed.)

---

## 8. Non-functional requirements

- **Latency:** odds end-to-end (TxODDS → client) < 3s; on-chain odds lag < 10s.
- **Settlement reliability:** idempotent cron; a bet is never settled twice (program guard on `status`); crash-safe resume.
- **Key safety:** oracle/admin keypairs via env/KMS only; never committed; rotation procedure documented.
- **Determinism:** the same odds snapshots always produce the same settlement — no backend-side discretion.
- **Observability:** metrics per service (feed lag, settle latency, exposure per pool), alerts on stalled feed or failed settles.
- **Testing:** every instruction covered for success, constraint violation, auth failure, and math edge cases (see `docs/fase-*.md` test matrices).

---

## 9. Roadmap (execution phases — `docs/fase-*.md`)

| Phase | Deliverable | Status |
|---|---|---|
| 0 | Oracle smoke test (`update_odds` on testnet) | **Done** |
| 1a / 1b | `place_bet` escrow / `settle_bet` | **Done** (tested) |
| 2a | `liquidity-pool`: create + deposit (LP mint) | Pending |
| 2b | Betting ↔ pool integration (CPI, lock/unlock) | Pending |
| 2c | `withdraw` + `claim_fees` | Pending |
| 3a | Dynamic payout | Pending |
| 3b | 80% exposure limit | Pending |
| 3c | `cancel_bet` | Pending |
| 4 | Backend services + TxODDS integration + REST/WS | Pending |
| 5 | Indexer + `/positions`, devnet end-to-end with app | Pending |

---

## 10. Open questions

1. Cancel fee policy: full refund vs fee retained on user-initiated cancel.
2. Pool lifecycle after match ends: auto-unlock timing and forced LP exit.
3. Oracle write cadence: fixed interval vs delta-threshold (cost vs freshness).
4. Protocol fee destination account and admin multisig for mainnet.
5. Grace window duration for dead-feed cancellation (§6).

---

*Counterpart: `mobile-seeker/PRD.md`. Interface changes require updating both.*
