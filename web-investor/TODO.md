# TODO.md — FutOdds investor web app (LP frontend)

**Goal:** a web app where liquidity providers (investors) fund the per-match pools that back all bets: connect a browser wallet, browse matches/pools, **deposit USDC**, track position + accrued fees, withdraw, claim. Lives at `web-investor/` in this repo.

**Data flow (same rule as the mobile app):** reads come from the **backend REST/WS** (`/pools`, `/matches` — see `backend/TODO.md` Phase 5); writes are **transactions built from the liquidity-pool IDL, signed in the user's wallet**. The web app never holds keys and never computes share/fee math for display-critical values — it renders what the backend/chain reports.

**Status:** not started — blocked on protocol Phase 2a (`liquidity-pool` program) for writes; UI shell can start against mocks earlier.

---

## 0. Design + brand (decided — do not revisit)

> **The web brand IS `mobile-seeker/brand.md` (Volt Court), verbatim** — same rule as the landing (`TODO-WEB.md` Phase B). No new palette. Dark-first: bg `#081310` (never pure black), surface `#0F1E18`, primary `#2FE083`, CTA gradient `#00E5C9 → #2FE083`, Inter + JetBrains Mono with `tabular-nums` for every number.

Direction: **Workstation-dense dashboard** (this is a money-management tool, not a marketing page): compact tables, mono numbers, one accent. Green only for CTAs and positive deltas paired with an icon/label (never color alone).

## Phase A — Scaffold

- [ ] `npx create-next-app@latest web-investor` — TypeScript, App Router, Tailwind, ESLint
- [ ] Port Volt Court tokens from `mobile-seeker/brand.md` into `globals.css` + Tailwind theme (reuse the landing's token mapping if `web/` exists by then — single source, no fork)
- [ ] `next/font/google`: Inter + JetBrains Mono as CSS variables
- [ ] Deps: `@solana/web3.js`, `@solana/wallet-adapter-react` (+ `-wallets`, `-react-ui`), `@coral-xyz/anchor` (client-side, for IDL-driven tx building), `@solana/spl-token`, `@tanstack/react-query`, `zod` (validate every API payload)
- [ ] Cluster config via env: RPC URL, program IDs, USDC mint, API base — devnet/mainnet parity with the app's flavor scheme
- [ ] Guardrails: no `#000000`, no `transition-all` (lint/grep gate)

## Phase B — Wallet + read layer

- [ ] Wallet adapter provider: Phantom, Solflare, Backpack; autoConnect; visible connect/disconnect states (this is standard wallet-adapter, **not** MWA — that's mobile-only)
- [ ] USDC balance read (owner ATA) with loading/empty/error states
- [ ] API client: typed fetchers for `GET /pools`, `GET /pools/{match_id}?wallet=`, `GET /pools/{match_id}/history`, `GET /matches` — zod-validated, react-query cached
- [ ] Mock server (or MSW) matching the backend schemas so UI work can proceed before Phase 5 of the backend lands
- [ ] On-chain fallback reads: derive Pool PDA (`["pool", match_id]`) from the IDL and read vault/state directly — the dashboard must degrade gracefully if the indexer is behind

## Phase C — Screens

### C1 — Pools dashboard (home)
- [ ] Table/cards of match pools: match (teams, kickoff, live badge), TVL, locked %, net exposure bar (UP vs DOWN), fee APR-to-date, my position
- [ ] Sort/filter: live first, by TVL, by my positions
- [ ] Global stats strip: total TVL, my total deposited, my accrued fees (all JetBrains Mono, `tabular-nums`)

### C2 — Pool detail
- [ ] Header: match info + pool status (`open | suspended | match settled`)
- [ ] Pool metrics: total/locked/available liquidity, exposure_up vs exposure_down (visual bar), fee rate split (2% → 1.5% LP / 0.5% protocol), LP share price
- [ ] My position: shares, current value, deposited vs current (PnL), claimable fees
- [ ] Activity feed from `/pools/{id}/history` (deposits, withdraws, fees) with explorer links

### C3 — Deposit flow (the core job)
- [ ] Amount input: chips (100/500/1000 USDC) + Max; validate against wallet balance and pool state before enabling CTA
- [ ] Preview panel: shares to receive, resulting pool share %, current fee rate — **values quoted by the backend, rendered as-is**
- [ ] Risk disclosure inline (honest tone per brand.md): locked liquidity can't be withdrawn until bets settle; LPs are the counterparty and can lose when bettors win
- [ ] Build `deposit(amount)` tx from the IDL (create ATA if missing), `signAndSendTransaction`, confirm at `confirmed`
- [ ] Tx lifecycle UI: building → wallet approval → pending (sig + explorer link) → confirmed → position refetch; failure → revert optimistic state, clear error toast
- [ ] First-deposit edge: pool with 0 liquidity (1:1 shares) renders correctly

### C4 — Withdraw + claim
- [ ] Withdraw: shares/amount input capped at **unlocked** portion; show locked remainder and why ("backing open bets until settlement")
- [ ] `withdraw(shares)` + `claim_fees()` txs, same lifecycle UI as deposit
- [ ] Empty/zero states: nothing deposited, nothing claimable

## Phase D — Live behavior

- [ ] Poll or WS-subscribe pool state so TVL/locked/exposure move while matches are live (reuse the backend WS if pool topics are added; otherwise react-query refetch ~10s)
- [ ] Suspended/settled states flip the UI live (deposit disabled + banner)
- [ ] Reconcile after every tx: on-chain account is the source of truth, never trust the optimistic value past confirmation

## Phase E — Polish + ship

- [ ] Entrance choreography per `page-load-animations` (staggered dashboard load; no ambient loops); number transitions via rolling/eased updates, not flashes
- [ ] Number formatting per the `number-formatting` skill (USDC 2dp, abbreviations ≥ 100k, tabular alignment)
- [ ] Responsive: dashboard usable at 375px (LPs will open it on phones)
- [ ] Accessibility: keyboard-navigable table + forms, contrast, icon+label on all deltas
- [ ] Analytics: `wallet_connected`, `pool_viewed`, `deposit_initiated/signed/confirmed`, `withdraw_*`, `claim_*`, tx errors
- [ ] Deploy to Vercel (devnet build first); env-switch for mainnet later
- [ ] E2E happy path (Playwright + wallet mock): connect → deposit → see position → withdraw

---

## Blockers / handshakes (track explicitly)

| Needs | From | Blocks |
|---|---|---|
| `liquidity-pool` IDL + devnet program ID + PDA seeds | protocol Phase 2a–2c | All writes (C3/C4) |
| `/pools` REST endpoints (schema in `backend/TODO.md` Phase 5) | backend | Real reads (can mock meanwhile) |
| Devnet USDC mint address | protocol | Balance + deposit |
| Cancel/settled pool lifecycle rules (when do LPs force-exit?) | protocol open question | Withdraw UX copy |

## Done criteria

- An LP with a browser wallet can: connect → pick a live match pool → deposit USDC with a clear risk disclosure → watch locked/exposure move during the match → withdraw unlocked funds and claim fees — all on devnet, every number traceable to backend/chain, every color traceable to a Volt Court token.
