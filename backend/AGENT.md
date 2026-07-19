# AGENT.md — FutOdds protocol (backend + smart contracts)

Guide for AI agents and developers working on the **protocol side** of FutOdds: the Anchor programs in `programs/` and the off-chain backend services. Read `backend/PRD.md` first — it is the source of truth for protocol scope. The repo-root `AGENTS.md` covers general workspace conventions (build commands, style, commit identity); this file adds the protocol-specific rules.

---

## 1. What this side owns

Binary options on live football odds (UP/DOWN within 1/5/10/20 min windows), settled in USDC on Solana. This side owns **everything the app consumes**:

- **Anchor programs**: `oracle-adapter` (odds on-chain), `betting-engine` (place/settle/cancel), `liquidity-pool` (LP deposits, shares, fees — not built yet)
- **Backend (Rust)**: TxODDS/TxLINE ingestion, oracle writer, settlement cron, WebSocket odds streaming, REST API, indexer, risk engine

### Scope boundary (critical)

The mobile app (`mobile-seeker/`) is owned by another developer. Never implement UI, wallet/MWA flows, or client logic here. The handshake is **PRD §7 interface contracts** (REST, WS, IDL/PDAs/events) — if a change alters those schemas, flag it as a cross-team decision and update **both** PRDs; never diverge silently.

---

## 2. Working rules (non-negotiable)

### Language and git
- All code, comments, identifiers, commits, and PR text in **English**. Conversation with the repo owner may be Portuguese; artifacts are English.
- Never commit to `main`; all changes via PR. Branches: `feat/<slug>`, `fix/<slug>`, `docs/<slug>`, `test/<slug>`.
- Conventional Commits. Reference the phase doc in PRs, e.g. `Refs docs/fase-2a-pool-deposit.md`.
- Commit identity: `olivmath <olivmath@protonmail.com>` (per root `AGENTS.md`).

### Protocol guardrails (violating these is a critical bug)
- **Only the oracle authority** may write odds or settle bets. Every authority check is security-sensitive code.
- **Escrowed funds move only through program instructions**: settle (payout), cancel (refund), withdraw (unlocked liquidity only). No other path out of a vault.
- **All amount math is checked** (`checked_add`/`checked_mul`/`checked_div`). Overflow → explicit error, never wrap or truncate.
- **Settlement is deterministic and idempotent**: same snapshots → same outcome; a bet settles exactly once (guard on `status`); the cron must be crash-safe to re-run.
- **Exposure check before state mutation** in `place_bet`: `net_exposure + new_payout ≤ 80% of pool`.
- **`odd_entry` and `odd_exit` live on-chain** — verifiability via explorer is a product requirement, not an optimization.
- **No secrets in the repo**: oracle/admin keypairs via env/KMS only. Default local wallet stays at `~/.config/solana/id.json`.
- **The backend quotes, the program enforces**: quotes from the REST API are indicative; the program recomputes and locks payout at `place_bet`. Never let the two formulas drift.

---

## 3. How to work here

### Phase discipline
Execution follows `docs/fase-*.md` — each phase has a fixed schema, instruction, guards, and a **test matrix**. Work one phase at a time:

1. Read the phase doc; treat its test matrix as the acceptance criteria.
2. Implement the instruction + accounts + errors in the target program.
3. Cover every row of the test matrix in `programs/<program>/tests/`.
4. Run `cargo test`, `cargo fmt --all`, `cargo clippy --workspace --all-targets`, and `anchor build` if IDLs changed.
5. Add a `## Status` section to the phase doc marking it done (see fase-0/1a/1b for the pattern).

Current state: phases 0, 1a, 1b **done** (oracle on testnet; `place_bet`/`settle_bet` tested). Next: **2a — liquidity-pool create + deposit**.

### Anchor conventions (this workspace)
- Rust `1.89.0` (pinned). Programs snake_case, accounts PascalCase, PDA seeds short and stable: `b"match"`, `b"bet"`, `b"pool"`.
- Validation lives next to the instruction: `require!` + explicit error enum per program.
- Odds are `u16` basis points of percentage (`6500` = 65.00%). USDC amounts are `u64` in native units (6 decimals).
- Tests name the behavior: `test_settle_rejects_before_expiry`, `test_deposit_rejects_settled_match`.
- Emit an Anchor event for every state transition (`BetPlaced`, `BetSettled`, …) — the app and the indexer both depend on them.

### Backend conventions
- Rust services, one binary per service (poller, oracle-writer, settlement-cron, ws-server, api, indexer) sharing a workspace crate for types.
- All timestamps are **server/chain time**; never trust client clocks.
- Normalize TxODDS decimal odds → bps at ingestion; store snapshots with source `ts`.
- Settlement uses the **first oracle snapshot at/after `expires_at`**; if none arrives within the grace window, cancel + refund (PRD §6).

---

## 4. Decided business rules — do not re-litigate

These close the open questions from the app PRD (§5.4/§10/§16). Implement them as specified; changing one requires updating both PRDs:

1. **Matching model**: pooled (bets vs per-match liquidity pool), not P2P.
2. **Payout**: dynamic from UP/DOWN distribution, quoted at entry, **locked on the Bet PDA**.
3. **Tie** (`odd_exit == odd_entry`): refund stake minus fee.
4. **Suspension** (goal/VAR): market stops accepting new bets; open positions keep running to expiry.
5. **Slippage**: no rejection window — the on-chain entry odd is authoritative and shown in results.
6. **Fee**: 2% per bet → 0.5% protocol / 1.5% LPs. **Stake**: 1–100 USDC. **Windows**: 1/5/10/20 min.

Still open (ask, don't guess): cancel fee policy, pool lifecycle after match end, oracle write cadence, mainnet admin/multisig, grace-window duration.

---

## 5. Definition of done for a PR

- [ ] English everywhere; Conventional Commit; PR references the phase doc
- [ ] `cargo test` green, including every row of the phase's test matrix
- [ ] `cargo fmt` + `clippy` clean; `anchor build` if program/IDL changed
- [ ] New instructions have auth-failure and invalid-input tests, not just happy path
- [ ] All new math uses checked arithmetic
- [ ] Events emitted for new state transitions
- [ ] No keypair, RPC secret, or TxODDS credential touched or committed
- [ ] If an interface surface changed (REST/WS/IDL/PDA/events): both PRDs updated and flagged for the app dev

---

## 6. References

- `backend/PRD.md` — protocol product spec (this side's source of truth)
- `ARCHITECTURE.md` (repo root) — programs, PDAs, formulas, service map
- `docs/fase-*.md` — phase plans with test matrices; `docs/deploy-testnet-oracle.md` — deploy notes
- `mobile-seeker/PRD.md` §7 — the app's view of the interface contracts (keep in sync)
- Root `AGENTS.md` — workspace build/style/commit conventions
