# brand.md — oddsdex

**Status:** active
**Palette:** Volt Court
**Applied:** 2026-07-17 · target: native Android (Jetpack Compose) — tokens live in `app/src/main/kotlin/com/oddsdex/app/ui/theme/`

---

## Product

**oddsdex** — fixed-time football odds trading on Solana (Seeker). Pick UP or DOWN on a live odd, watch it move for 60 seconds, settle in USDC.

- Category: defi · trading
- Mood: **bold + technical**
- Reference: OlympTrade first-run flow (dark chart, coach sheets, gradient CTA)

## Palette — Volt Court

*defi · odds up · bold · electric.* Near-black with a subtle pitch-green tint (a football field at night); electric green as the reward-coded brand color.

### Seeds (dark — primary mode; the app is dark-first)

| Role | OKLCH | Hex |
|---|---|---|
| bg-base | `oklch(0.12 0.015 160)` | `#081310` |
| bg-elevated | `oklch(0.17 0.02 160)` | `#0F1E18` |
| primary | `oklch(0.76 0.21 148)` | `#2FE083` |
| primary-soft | `oklch(0.87 0.15 148)` | `#83EDAF` |
| fg-base | `oklch(0.97 0.008 160)` | `#F0F5F2` |

### Seeds (light — derived from the same hues, for future web/light surfaces)

| Role | OKLCH | Hex (approx) |
|---|---|---|
| bg-base | `oklch(0.98 0.006 160)` | `#F6FAF7` |
| bg-elevated | `oklch(1 0 0)` | `#FFFFFF` |
| primary | `oklch(0.50 0.19 150)` | `#0E8A4C` |
| primary-soft | `oklch(0.70 0.13 150)` | `#5FBE8D` |
| fg-base | `oklch(0.17 0.015 160)` | `#10201A` |

All pairs verified WCAG AA (body ≥ 4.5:1, large/UI ≥ 3:1) in both modes.

### Compose mapping (source of truth: `ui/theme/Color.kt`)

| Token | Value | Use |
|---|---|---|
| `Background` | `#081310` | Screens |
| `Surface` / `ChipSurface` | `#0F1E18` / `#14261F` | Cards, chips |
| `TextPrimary` / `TextSecondary` | `#F0F5F2` / `#85948B` | Text |
| `Primary` = `Up` | `#2FE083` | CTA, UP, wins, payouts |
| `PrimarySoft` | `#83EDAF` | Hover/badges |
| `Down` | `#FA5A6A` | DOWN, losses (with icon+label, never color-only) |
| `SeriesCyan` | `#41D9E8` | Chart line — data-neutral, NOT the brand green |
| `SheetBackground/Title/Body` | `#ECF6F0` / `#081310` / `#39463F` | Light coach sheets over the dark chart |

## The dopamine rule (non-negotiable)

The electric green is **reserved for reward and action**: CTAs, the UP button, win states, payouts. It must never become ambient (backgrounds, decorations, the chart line) — reward colors that are everywhere stop rewarding (hedonic adaptation). The live chart stays **cyan** (`SeriesCyan`) because the series must read as neutral before settlement; red appears only on DOWN/losses. The anticipation phase (60s countdown) may use the CTA gradient for the progress bar — anticipation is where dopamine peaks.

## Typography

**Inter** (UI text) + **JetBrains Mono** (all numbers: odds, countdowns, amounts, addresses — always `tabular`). Bundled as variable fonts in `app/src/main/res/font/`; wired in `ui/theme/Type.kt` (`InterFamily`, `JetBrainsMonoFamily`, `OddsdexTypography`). For a future web surface, the same pair is on Google Fonts (`next/font/google`: `Inter`, `JetBrains_Mono`).

## Gradients

| Name | Definition | Use |
|---|---|---|
| `cta` | horizontal `#00E5C9 → #2FE083` | Primary gradient CTAs (lands on the brand green) |
| `glow` | vertical `transparent → #00E5C9 @ 16%` | Bottom-of-screen ambient glow (ReadyScreen) |
| chart fill | vertical `SeriesCyan 22% → 2%` | Area under the odds line |

## Tone / voice

- **Direct and kinetic.** Short sentences, verbs first ("Pick a direction", "Settles in 42s"). Never bureaucratic.
- **Confident, not carnival.** It's trading, not a slot machine: no exclamation spam, no emoji in core flows. The win moment is allowed one celebration ("Parabéns! Você estava certo").
- **Honest about risk.** Never promise wins; demo simulation is labeled as such in store copy. pt-BR is the launch language; English strings are the source (`values/strings.xml`).

## Do / Don't

- **Do** keep screens near-black; let green pop only at decision and reward moments.
- **Do** use JetBrains Mono for every number the user watches move.
- **Don't** color the chart line green or red — it stays cyan until settlement.
- **Don't** use green and red as the only differentiator — always pair with ↑/↓ icons and labels (accessibility, PRD §11).
- **Don't** introduce new hues; the palette is bg-greens + electric green + cyan (data) + red (down) only.
