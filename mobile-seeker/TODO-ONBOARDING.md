# TODO-ONBOARDING.md — Interactive onboarding with trade demo

Feature TODO for the interactive onboarding: a guided, simulated demo trade the user completes **before** connecting a wallet. Modeled on the OlympTrade first-run tutorial (reference screenshots in `imagens-app/`): live chart + coach-mark bottom sheets + a scripted demo trade ending in a win. Adapted to our product: the series is a **football team's live odd** (not an asset price), and the bet is **UP/DOWN in the next 60 seconds** (PRD §5).

Everything here is simulated on-device: no wallet, no backend, no real money. Copy shown to the user is pt-BR via string resources (AGENT.md: no hardcoded Portuguese in composables).

---

## Reference breakdown (from `imagens-app/`)

| Screen | What it shows | Our adaptation |
|---|---|---|
| `image.png` | Dark chart (Gold), cyan line + gradient fill, current-value pill on right axis, sheet: "Aqui está um guia rápido…" + gradient CTA "Vamos lá" | Same layout; header shows match + selection (e.g. "Palmeiras × Flamengo · Palmeiras vence") instead of "Gold"; pill shows the odd (e.g. `2.10`) |
| `image copy.png` | Coach sheet "Analise a movimentação do preço", stake stepper ($100), duration stepper (1 min), red **Vender ↓** / green **Comprar ↑** | Sheet copy about odd movement; steppers fixed at demo values (100 demo USDC, 60s); buttons **DESCE ↓** (red) / **SOBE ↑** (green) — icon + label, never color alone (PRD §11) |
| `image copy 2.png` | Result: "Parabéns! Você estava certo — lucrou $93" + CTA "Avançar" | Result sheet with odd entry → exit, stake, simulated payout; CTA advances to wallet connect |

---

## Phase A — Design direction (before any UI code)

- [ ] Consult the design skills (`design-taste` for direction, `frontend-design-guidelines`/`number-formatting` where applicable) and translate the reference into a small design spec for Compose: dark-first palette (near-black background, cyan `#00E5C3`-ish series line, red/green semantic pair, cyan→green gradient CTA), typography scale, sheet styling
- [ ] Define the chart visual spec: line + vertical-gradient area fill, subtle horizontal gridlines, right-edge axis labels, current-value pill with leader line and diamond marker (as in reference), entry-price dashed line once a position opens
- [ ] Number formatting rules for odds (2 decimal places, e.g. `2.10`) and demo USDC amounts
- [ ] Decide app theme direction now (this becomes the app's real look, not throwaway): tokens in `ui/theme/` (colors, gradients, shapes)

## Phase B — Simulated odds engine (`domain/`, pure Kotlin)

- [ ] `TickSource` interface (`Flow<OddsTick>`) — the contract the real WS client will also implement later (ARCHITECTURE.md §5); the demo plugs `SimulatedTickSource` into the same chart the trade screen will use
- [ ] `SimulatedTickSource`: random-walk generator around a base odd (e.g. 2.10), sub-second ticks (~150–250 ms), realistic jitter with occasional small jumps; deterministic seed injectable for tests
- [ ] **Scripted outcome**: after the user picks a direction, bias the walk so the demo ends in a win (reference behavior). Keep the bias code isolated and demo-only — it must be impossible to reach from real trading code paths
- [ ] Demo position model reusing `PositionStateMachine` states (`open → settling → settled`) so the tutorial exercises the same lifecycle the real flow will use
- [ ] Unit tests: seeded walk reproducibility, win-bias converges, settlement math (`payout = stake × multiplier`, fixed demo multiplier e.g. 1.93 → "lucrou 93")

## Phase C — Chart component (`ui/chart/`, the real one)

- [ ] Compose `Canvas` line chart per ARCHITECTURE.md §5: ring buffer input, decimation, redraw via `withFrameNanos` without per-tick recomposition, no allocations in the draw path
- [ ] Visual layers: gradient area fill, series line, gridlines, right-axis labels, current-value pill + leader line, entry-line marker, smooth y-axis autoscale
- [ ] 60 fps validation on the physical Seeker with sub-second simulated ticks (this doubles as TODO.md Phase 5's "chart spike" — check that item off when done)
- [ ] Countdown ring/bar component for the 60 s window (server-clock-driven later; demo uses elapsed monotonic time)

## Phase D — Onboarding flow (`ui/onboarding/`)

Step machine (each step = coach sheet over the live chart, all skippable):

1. `INTRO` — sheet: quick guide intro, CTA "Vamos lá" (`image.png`)
2. `EXPLAIN` — sheet: "the odd of <team> is moving — will it go UP or DOWN in the next 60 s?"; stake (100 demo USDC) and window (60 s) steppers visible but fixed; **SOBE ↑ / DESCE ↓** buttons enabled (`image copy.png`)
3. `RUNNING` — position open: entry-odd line pinned, countdown running, live PnL indicator ("no lucro/prejuízo — indicativo")
4. `RESULT` — scripted win sheet: entry → exit odd, stake, payout credited to a demo balance; CTA "Avançar" (`image copy 2.png`)
5. `HANDOFF` — value recap + CTA to connect the real wallet (enters the existing wallet flow); secondary "explorar antes" path if we want to allow browsing without wallet

Tasks:

- [ ] `OnboardingStep` state machine (pure Kotlin, unit-tested) + ViewModel wiring to `SimulatedTickSource`
- [ ] Coach-mark bottom sheet component matching reference styling (light sheet on dark chart, bold title, body, gradient CTA)
- [ ] Demo trade controls: stake/window steppers (locked in demo), SOBE/DESCE buttons with press feedback
- [ ] Skip affordance on every step; completing or skipping persists `onboarding_done` (DataStore) so it never auto-shows again (re-watchable from Profile later)
- [ ] pt-BR copy in `res/values/strings.xml` (source English strings + pt-BR translation per AGENT.md localization rule)
- [ ] Demo disclaimer visible during the demo: simulated data, no real funds ("simulação — sem dinheiro real") — required honesty for a betting-shaped product (PRD §14 spirit)

## Phase E — Integration & polish

- [ ] Wire into app entry: fresh install → onboarding; `onboarding_done` → straight to home (wallet flow)
- [ ] Replace the temporary smoke-test screen in `MainActivity` with real navigation (Compose Navigation): `onboarding` → `home` placeholder
- [ ] Analytics events (PRD §12): `onboarding_started`, `demo_trade_opened` (direction), `demo_trade_settled`, `onboarding_completed` / `onboarding_skipped` (instrument locally; analytics backend TBD)
- [ ] On-device pass on the Seeker: 60 fps chart during the whole flow, sheet transitions smooth, back-button behavior sane at each step
- [ ] Accessibility: content descriptions, touch targets ≥ 48 dp, direction conveyed by icon+label+position (not color only)

## Acceptance criteria (definition of done for the feature)

- Fresh install lands on the demo with a live-moving odd chart at 60 fps on the Seeker
- User completes intro → picks SOBE or DESCE → watches 60 s countdown → sees the scripted win with correct payout math → lands on wallet connect
- Flow is fully skippable and never reappears after completion/skip
- No wallet, network, or real-money code paths touched by the demo; win-bias unreachable outside demo
- All copy localized (pt-BR), all AGENT.md rules honored (English code/commits, PR-sized changes per phase)

## Product decisions (answered 2026-07-17)

1. **Demo window duration**: real **60 s**, matching the product mechanic
2. **Guaranteed win**, with the "Parabéns! Você estava certo — lucrou X" result sheet exactly like the reference
3. Demo match: **Argentina × Espanha**, selection "Argentina vence"
4. After the demo, **wallet connect is mandatory**: `HANDOFF` goes straight into MWA connect with the Seeker's Seed Vault Wallet
