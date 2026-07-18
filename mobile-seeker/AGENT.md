# AGENT.md — `oddsdex` mobile app

Guide for AI agents and developers working in this repository. Read `PRD.md` first — it is the source of truth for product scope. This file defines *how* to work here.

---

## 1. What this project is

Mobile app for **football odds trading** (fixed-time / binary option model, OlympTrade-style) on **Solana**, settled in **USDC**, distributed via the **Solana Seeker dApp Store**.

The user does not bet on the match result. They bet on the **direction of an odd's movement** (`UP` / `DOWN`) within a fixed timeframe. Correct direction → `payout = stake × multiplier`. Wrong → stake lost.

**Target platform: Solana Seeker only** (Android + Solana Mobile Stack). No iOS, no web in MVP.

### Scope boundary (critical)

This repo is the **client app only**. The following are owned by another developer and are **out of scope** — never implement them here:

- Smart contract (Anchor program): custody, matching, settlement, payout, fees
- Oracle / odds feed and the settlement source of truth
- Back-end: odds ingestion, WebSocket streaming, REST API, on-chain indexer, multiplier/payout calculation, KYC
- Liquidity / market making, deploy infra, RPC, indexer

The app **consumes** three surfaces defined in PRD §7: REST API, WebSocket, and the on-chain program. Treat those schemas as contracts — if a change requires altering them, flag it as a cross-team decision instead of silently diverging.

---

## 2. Working rules (non-negotiable)

### Language
- **All code, comments, identifiers, commit messages, PR titles, and PR descriptions are in English.** Always. No Portuguese in code or git history.
- UI copy shown to end users may be localized (pt-BR is the initial market), but keep copy in localization files — never hardcode Portuguese strings in components.
- Conversation with the repo owner can be in Portuguese; artifacts are English.

### Git workflow
- **Never commit directly to `main`. All changes go through a Pull Request** — even small ones, even docs.
- Branch naming: `feat/<short-slug>`, `fix/<short-slug>`, `chore/<short-slug>`, `docs/<short-slug>`.
- Commits follow **Conventional Commits** (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`), in English, imperative mood.
- One PR = one coherent change. Keep PRs small and reviewable.
- PR description must state: what changed, why, how it was tested, and any open questions/blocked decisions (reference PRD sections, e.g. "blocked on §5.4 tie handling").

### Product guardrails (from the PRD — violating these is a bug)
- **The app never calculates business rules.** Multiplier/payout comes from `GET /markets/{id}/quote` and is only rendered (P4).
- **Non-custodial, always.** Signing happens exclusively via MWA / Seed Vault. The app never touches, stores, or logs a private key or seed (P5, §13).
- **On-chain is the final source of truth** for position state. Optimistic UI must always be reconcilable with the on-chain account (§8.3, §11).
- **Use server `ts`, never the device clock**, for countdowns, chart rendering, and anything settlement-related (§10).
- **Validate all WS/API data before rendering**, especially values that feed into a transaction (§13).
- Never send `publicKey` to third-party analytics without anonymization (§13).
- Every fetch/screen has explicit loading / empty / error / offline states (§11).

---

## 3. Stack and architecture

**Decision (2026-07-17): native Kotlin Android** — supersedes the PRD §8.1 React Native recommendation. Rationale: the real-time odds chart is the core screen and needs a native render loop, and we develop directly on a physical Seeker. See `ARCHITECTURE.md` for the full design; summary:

- **Kotlin + Jetpack Compose** (single activity, Compose Navigation), Hilt, coroutines/`Flow`
- Solana Mobile Kotlin SDK: `mobile-wallet-adapter-clientlib-ktx`, `web3-solana`, `rpc-core`, `multimult`
- Ktor for REST + WebSocket; `kotlinx.serialization` with strict validation
- Odds chart: custom Compose `Canvas` with `withFrameNanos` — no charting library, no allocations in the draw path
- No Anchor Kotlin SDK exists: instruction encoding/account decoding is hand-rolled in `chain/anchor/` from the versioned IDL, tested against fixtures from the program's TS client
- Position lifecycle: explicit state machine `idle → building → pending → open → settling → settled` (pure Kotlin, JVM-tested)

### Layers (keep them separated)
| Layer | Responsibility |
|---|---|
| `wallet/` | `MobileWalletAdapter` session, `authToken` persistence (encrypted), USDC balance |
| `realtime/` | Ktor WS client for odds, snapshot + deltas, ring buffer/decimation, auto-reconnect |
| `chain/` | Tx building (`open_position`, `withdraw`), PDA reads, log subscriptions, Anchor encoding |
| `domain/` | Position state machine, catalog, reconciler, server clock (pure Kotlin, no Android imports) |
| `ui/` | Compose screens + design system (no business logic) |

---

## 4. Known open decisions — do not guess

These PRD questions (§5.4, §10, §16) are **unresolved**. If a task depends on one, implement behind an abstraction or ask — do not invent an answer:

1. Matching model (P2P / pool / house) → fixed vs variable multiplier
2. Tie handling (`odd_exit == odd_entry`)
3. Open position behavior during market suspension (goal/VAR)
4. Slippage policy between displayed odd and on-chain registered odd
5. Whether `odd_entry`/`odd_exit` live on-chain (verifiability) or off-chain only
6. Custody model detail (user ATA vs vault PDA)
7. Timeframe set and stake min/max

---

## 5. Definition of done for a PR

- [ ] Code, comments, commits, PR text in English
- [ ] Typecheck and lint pass; tests pass (add tests for domain logic, especially the position state machine)
- [ ] No business-rule calculation in the client (payout, multiplier, settlement outcome)
- [ ] No private key material or secrets touched, logged, or persisted
- [ ] Loading / empty / error / offline states handled for anything that fetches
- [ ] Optimistic UI paths have a reversal/reconciliation path (tx failure → revert, §6.3)
- [ ] Accessibility: color is never the only signal (UP/DOWN uses icon/label too, §11)
- [ ] Relevant analytics events from §12 instrumented when adding user-facing flows

---

## 6. References

- `PRD.md` — product spec (Portuguese). §7 interface contracts are the app's external API surface.
- `imagens-app/` — app reference images.
- Back-end and smart contract specs live in separate documents owned by the other developer.
