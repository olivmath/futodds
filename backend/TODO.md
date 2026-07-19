# TODO.md — FutOdds protocol (contracts + backend)

Execution checklist for the protocol side. Source of truth for scope: `backend/PRD.md`; working rules: `backend/AGENT.md`; per-phase specs with test matrices: `docs/fase-*.md`. Work top to bottom — each phase unblocks the next. Every change lands via PR, in English.

**Current state (2026-07-19):** phases 0/1a/1b done (oracle on testnet; `place_bet`/`settle_bet` implemented and tested). Liquidity pool, backend services, and TxLINE integration not started. **Phase 1.5 below lists gaps found in the existing code** (2026-07-19 review of `programs/*/src/lib.rs`) that no later phase covers.

---

## Phase 1.5 — Retrofit existing programs (gaps in shipped code)

Fixes to `oracle-adapter` and `betting-engine` as they exist today. Do these before or alongside Phase 2 — several are prerequisites for its test matrices.

### oracle-adapter
- [x] Add `status: MatchStatus (Upcoming|Live|Settled)` to `MatchAccount` + authority-gated `set_match_status` instruction — **blocks fase 2a** ("reject deposit on settled match" test needs it); also lets `place_bet` reject bets on non-live matches (no guard today)
- [x] Emit `OddsUpdated { match_id, odds, ts }` event (indexer + app depend on program events)
- [x] Add `set_authority` instruction for oracle key rotation (Phase 6 documents the procedure; the instruction must exist first)
- [x] Note: account layout changes = redeploy with migration or fresh PDAs on testnet — decide and document

### betting-engine — settlement integrity (the critical one)
- [x] **`settle_bet` must read `odds_at_expiry` from the Match PDA, not from an instruction argument.** Today the authority passes any `odds_at_expiry_home` value it wants — nothing on-chain constrains it. Require the `match_account` account (seeds-checked against `bet.match_id`) and `match_account.updated_at >= bet.expires_at` (first snapshot at/after expiry, per PRD §6)
- [x] Store `odds_at_expiry` on the Bet PDA at settlement — required for the app's result screen and explorer verifiability (PRD §5.2 already specs the field; the struct lacks it)
- [x] **Tie handling**: `odds_at_expiry == odds_at_entry` currently falls into `won = false` → user loses. Decided rule (PRD §6): refund stake minus fee → add `status = Refunded` variant + transfer path
- [x] Emit `BetPlaced` / `BetSettled { result, payout }` events

### betting-engine — spec alignment
- [x] Add `selection` field (Home|Away|Draw) to `Bet`; read the matching odds from the Match PDA instead of hardcoded `odds_home` (PRD §1.2: the underlying is a specific selection)
- [x] Fix window set: `VALID_WINDOWS` has `900` (15 min); PRD says 1/5/10/20 min → `[60, 300, 600, 1200]`
- [x] Add `MAX_BET_AMOUNT` (100 USDC) — only the minimum is enforced today
- [x] Replace unchecked `amount * PAYOUT_NUMERATOR / PAYOUT_DENOMINATOR` with checked math (guardrail in `AGENT.md` §2; the fixed 1.8× itself dies in fase 3a, but the interim code must not overflow)
- [ ] 2% fee deduction at `place_bet` — implement with the pool split in fase 2b (tracked there; noted here so the interim no-fee state is a known gap, not an oversight)
- [x] Close settled/refunded Bet accounts (`close = user`) to return rent — decide policy (immediate on settle vs separate `close_bet` ix so history stays readable until indexed)
- [x] Update `programs/betting-engine/tests/` for all of the above (tie case, oracle-read settlement, selection, window/stake bounds)

**Exit criterion: settlement provable end-to-end from on-chain data alone (Match PDA snapshot → Bet PDA result), tie refunds, events emitted — before any pool money flows.**

## Phase 2 — Liquidity pool program (`programs/liquidity-pool/`)

The pool is what the investor web app (`web-investor/`) deposits into — it blocks that entire frontend, so it comes first.

### 2a — Create + deposit (`docs/fase-2a-pool-deposit.md`)
- [x] Scaffold `programs/liquidity-pool` in the Anchor workspace (`Anchor.toml`, `Cargo.toml` member)
- [x] `create_pool(match_id, fee_rate)` — Pool PDA (`["pool", match_id]`), USDC vault PDA (`["vault", match_id]`, authority = pool). Shares tracked via `LpPosition` PDA per the fase-2a spec (SPL LP mint deferred; revisit if composability is needed)
- [x] `deposit(amount)` — transfer USDC user→vault, LP shares pro-rata (`shares = amount × total_shares / total_liquidity` in u128, first deposit 1:1)
- [x] Guards: match not `Settled` (create + deposit), min 1 USDC, zero-share reject, checked math everywhere
- [x] Events: `PoolCreated`, `PoolDeposited { owner, amount, shares, totals }`
- [x] Full test matrix from the phase doc (incl. reject deposit on settled match) — 11 tests
- [x] Mark phase doc `## Status` done

### 2b — Betting ↔ pool integration (`docs/fase-2b-pool-integration.md`)
- [ ] `place_bet` locks `payout` in the pool (`locked_liquidity += payout`) via CPI or shared-account constraint — decide and document the coupling (CPI vs single program with modules; record the decision in the phase doc)
- [ ] `settle_bet` Won → pay from vault, unlock; Lost → stake joins pool liquidity, unlock, accrue fees (0.5% protocol / 1.5% LP buckets)
- [ ] Invariant tests: vault balance == total_liquidity + escrowed stakes at every step; locked never exceeds total
- [ ] Mark phase doc done

### 2c — Withdraw + fees (`docs/fase-2c-withdraw-fees.md`)
- [ ] `withdraw(shares)` — burn shares, return pro-rata **unlocked** USDC only; reject if it would touch `locked_liquidity`
- [ ] `claim_fees()` — LP pro-rata claim + separate protocol-fee withdrawal (admin-gated)
- [ ] Events: `PoolWithdrawn`, `FeesClaimed`
- [ ] Mark phase doc done

## Phase 3 — Risk + payout (`betting-engine`)

- [ ] **3a Dynamic payout** (`docs/fase-3a-dynamic-payout.md`): payout from UP/DOWN distribution per PRD §1.3 formula, fee deducted first, quoted value locked on the Bet PDA; property tests (payout monotonicity, no overflow at max stake × max pool)
- [ ] **3b Exposure limit** (`docs/fase-3b-exposure-limit.md`): track `exposure_up/down`, reject when `net_exposure + new_payout > 80% × total_liquidity`; check runs **before** any state mutation
- [ ] **3c Cancel** (`docs/fase-3c-cancel-bet.md`): guards `status == Open && now < expires_at && (signer == user || authority)`; refund per cancel-fee policy (open question — confirm with owner before implementing the fee part)
- [ ] Update IDLs, commit `target/idl/*.json`, tag a program release for the app + web-investor devs

**Exit criterion: `cargo test` green across all three programs, devnet deploy of the full trio, IDLs published.**

## Phase 4 — TxLINE integration (odds source)

Real flow per the [quickstart](https://txline.txodds.com/documentation/quickstart): TxLINE access is itself **on-chain** — you subscribe via their Anchor program, then activate an API token with a wallet signature. Free World Cup tier ([docs](https://txline.txodds.com/documentation/worldcup)) needs no TxL purchase, only SOL for fees.

- [ ] Create a dedicated TxLINE subscriber keypair (NOT the oracle authority; env/KMS, never committed) and fund with devnet SOL
- [ ] Devnet first: program `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`, host `https://txline-dev.txodds.com` — everything (RPC, IDL, JWT, activation) on the same network
- [ ] Run their [runnable devnet examples](https://txline.txodds.com/documentation/examples/devnet-examples) (Node 20+) to validate the loop before writing our own code
- [ ] Subscribe free tier: `subscribe(SERVICE_LEVEL_ID=1, DURATION_WEEKS=4)` with treasury/pricing-matrix PDAs per quickstart
- [ ] Activate: guest JWT (`POST /auth/guest/start`) → sign `${txSig}::${jwt}` (detached, base64, same wallet) → `POST /api/token/activate` → store `apiToken`
- [ ] Implement credential lifecycle in the backend: send `Authorization: Bearer <jwt>` + `X-Api-Token`; auto-renew JWT on 401; alert on 403; re-subscribe before the 28-day expiry (calendar/cron reminder)
- [ ] Ingest: fixtures (match catalog), odds snapshots + StablePrice stream (SSE), scores stream; normalize decimal odds → bps with source `ts`
- [ ] Mainnet plan for the World Cup: service level **12** (real-time, free) — level 1 has a 60s delay, unusable for 1-min windows; document the switch (program `9ExbZ…`, host `txline.txodds.com`)
- [ ] Join Discord/Telegram dev support channels; note contacts in `docs/`

**Exit criterion: live World Cup/friendlies odds streaming into our normalized snapshot store on devnet credentials.**

## Phase 5 — Backend services (Rust workspace `backend/`)

Scaffold one binary per service + a shared `types` crate. The app AND the investor web read everything through this layer — neither client talks to TxLINE or the indexer store directly.

- [ ] **Scaffold**: cargo workspace, config via env, Dockerfile, `just`/make targets, tracing + metrics from day 1
- [ ] **Odds Poller / TxLINE client** (phase 4 productionized): reconnecting SSE consumer + snapshot poller, staleness detection
- [ ] **Oracle Writer**: debounced `update_odds` per match (write on meaningful delta or every N s — cost vs freshness, measure on devnet); priority fees; retry with backoff
- [ ] **Settlement Cron**: every ~5s scan `Open` bets past expiry → `settle_bet` with first snapshot at/after expiry; idempotent (program `status` guard is the backstop); dead-feed grace window → `cancel_bet` + refund
- [ ] **Indexer**: subscribe program logs + account changes → Postgres (bets, pools, LP positions, odds history)
- [ ] **REST API** (PRD §7.1): `/matches`, `/matches/{id}`, `/markets/{id}/quote`, `/positions` — **plus the pool surface for web-investor** (extend PRD §7.1 in both PRDs):
  - [ ] `GET /pools` — per-match pool list: TVL, locked, exposure_up/down, fee accrued, LP share price
  - [ ] `GET /pools/{match_id}` — detail + depositor's position (`?wallet=`)
  - [ ] `GET /pools/{match_id}/history` — deposits/withdraws/fees timeline
- [ ] **WS Server** (PRD §7.2): `SUB match:{id}:market:{id}` snapshot + deltas, server `ts`, `open|suspended|closed`
- [ ] **Risk Engine**: watch exposure per pool, set `suspended` when limits near; suspension on TxLINE feed events

**Exit criterion: `docker compose up` runs the full stack against devnet; REST/WS serve real TxLINE-fed data.**

## Phase 6 — End-to-end + hardening

- [ ] Devnet e2e: LP deposits via web-investor → bettor places via app → odds move (real feed) → settlement pays → LP withdraws + claims fees
- [ ] Load-test settlement burst (many bets expiring in the same slot window)
- [ ] Key rotation procedure documented (oracle authority + TxLINE subscriber)
- [ ] Alerts: feed stalled, settle latency > 30s, exposure > 70%, JWT/token expiry
- [ ] CI: `cargo fmt` + `clippy` + `cargo test` + `anchor build` on every PR

---

## Interface deliverables owed to the other repos (don't lose these)

- [ ] Versioned IDLs + program IDs per cluster (app `chain/idl/`, web-investor)
- [ ] PDA seed documentation (`["match", id]`, `["pool", id]`, `["bet", id, user, nonce]`)
- [ ] Devnet USDC mint (mock) address for both clients
- [ ] REST/WS schemas frozen → update `backend/PRD.md` §7 AND `mobile-seeker/PRD.md` §7 together
