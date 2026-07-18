# TODO-WEB.md — oddsdex landing page (Next.js)

**Goal:** a marketing landing page for oddsdex (fixed-time football odds trading on Solana Seeker), living at `web/` in this repo. Reference: **olymptrade.com** — which is already the product's design north star (`mobile-seeker/brand.md` cites the OlympTrade first-run flow).

**Status:** not started — this file is the plan.

---

## 0. What we learned from olymptrade.com (scraped 2026-07-17)

| Aspect | OlympTrade | Our call |
|---|---|---|
| Scheme | Dark, `#000000` background | Dark, but **`#081310`** (Volt Court bg — never pure black, per design rules) |
| Primary | Electric green `#6AFF41` | Volt Court green **`#2FE083`** — practically siblings; the brand already matches the reference |
| Type | Single sans (Nacelle), H1 56px, body 14px | **Inter** (UI) + **JetBrains Mono** (every number) — already the app pair, on Google Fonts via `next/font` |
| Radius | 12px | 12–16px, matches the app's 14–16dp chips |
| Structure | Hero + CTA → trust badges (130 countries, awards, 24/7) → "start with $1" → demo account → app download | Same skeleton, but **honest**: our trust section is the tech (Solana, Seed Vault, non-custodial), not invented awards |
| CTA pattern | "Easy start" + "Sign in" | "Baixar para Seeker" (primary) + "Ver demo" (secondary) |

## 1. Design brief (design-taste)

```
Direction: dark trading landing — Gradient Trust moments over a
           Workstation-adjacent product demo, on Volt Court tokens
Density:   spacious on marketing sections; compact only inside the
           product-demo chart card
Surface:   flat near-black sections; content in elevated cards (#0F1E18)
Type mood: kinetic, technical, mono-numbers
Motion:    crisp springs, entrance choreography only — no ambient loops
Do:        - one accent (electric green) reserved for CTAs and win moments
           - live animated odds chart in the hero (cyan line — data-neutral)
           - JetBrains Mono + tabular-nums for every number on the page
           - CTA gradient #00E5C9 → #2FE083 only on primary buttons
           - real app screenshots (mobile-seeker/imgs/) in device frames
Don't:     - pure #000 backgrounds (use #081310)
           - green/red chart line before "settlement" (dopamine rule)
           - multiple accent hues, glassmorphism, generic AI-purple gradients
           - transition-all; no fake trust badges or invented stats
```

**Section map** (adapting OlympTrade's skeleton, top to bottom):

1. **Hero** — headline ("Negocie odds ao vivo. 60 segundos. USDC."), sub, dual CTA, and a **live animated odds chart** (port `SimulatedTickSource` math to TS — it's ~100 lines) with UP/DOWN pills. The chart IS the pitch.
2. **How it works** — 3 steps (pick a match & team → UP or DOWN → settle in 60s), one card each, mono numbers.
3. **Product** — Seeker phone frames with real screenshots (`mobile-seeker/imgs/`), feature bullets (team-side toggle, history, stake/unstake).
4. **Trust = tech** — non-custodial (Seed Vault signs, keys never leave the device), USDC settlement, Solana speed/fees. Link to the program when it ships.
5. **FAQ** — what's an odd, what happens on tie, fees, devnet vs mainnet.
6. **Download CTA** — Solana dApp Store badge + QR code; repeat gradient CTA.
7. **Footer** — risk disclaimer (honest-about-risk tone from brand.md), links, pt-BR/en switch.

---

## 2. Phases

### Phase A — Scaffold
- [ ] `npx create-next-app@latest web` — TypeScript, App Router, Tailwind, ESLint, `src/` off
- [ ] Repo hygiene: `web/.gitignore` (Next defaults), add `web` note to root README if one lands
- [ ] Install: `framer-motion` (entrance choreography), `shadcn/ui` (init only — Button, Accordion for FAQ)
- [ ] `next/font/google`: Inter (variable) + JetBrains Mono (variable), wired as CSS variables

### Phase B — Design tokens (before any section)
- [ ] Port Volt Court seeds from `mobile-seeker/brand.md` into `globals.css` CSS vars (dark-first; the light seeds exist in brand.md if a light mode is ever wanted — not for v1)
- [ ] Map to Tailwind theme: `bg`, `surface`, `chip`, `fg`, `fg-muted`, `primary`, `primary-soft`, `down`, `series-cyan`, gradient `cta`
- [ ] Copy `web/brand.md` → symlink-style pointer to `mobile-seeker/brand.md` (single source of truth; do NOT fork the palette)
- [ ] Guardrail grep in CI or pre-commit: no `#000000`, no `transition-all`

### Phase C — Hero + live chart (the hard part, do it first)
- [ ] Port the tick generator (momentum + volatility clustering + mean reversion from `SimulatedTickSource.kt`) to a small TS module
- [ ] Canvas (or SVG-path) odds chart: cyan line, gradient area fill, price pill, ~45s window — same motion rules as the app (spring head, smoothed autoscale, clean-cut on series switch)
- [ ] Hero copy pt-BR (launch language) with en dictionary structure ready
- [ ] Dual CTA: gradient primary ("Baixar para Seeker") + quiet secondary ("Ver como funciona" → scroll)
- [ ] Mobile-first pass: chart legible at 360px wide

### Phase D — Remaining sections
- [ ] How it works (3 cards)
- [ ] Product showcase with `mobile-seeker/imgs/*.png` in a Seeker device frame
- [ ] Trust = tech section
- [ ] FAQ (Accordion)
- [ ] Download CTA + footer with risk disclaimer

### Phase E — Motion & polish
- [ ] Entrance choreography per `page-load-animations` skill: staggered hero (headline → sub → CTA → chart fade-in), scroll-triggered section reveals (once, no re-trigger)
- [ ] Asymmetric timing (enter ~300ms, exit ~200ms); no bounce on marketing sections
- [ ] Anti-slop review pass (`design-taste` review mode) + craft pass on spacing/contrast

### Phase F — Ship
- [ ] SEO: metadata, OG image (dark card with the chart), favicon from app icon
- [ ] Lighthouse ≥ 95 performance/accessibility (the canvas chart must not tank LCP — render static first frame, animate after)
- [ ] Analytics hook (same `Analytics.log` event names where it makes sense: `landing_cta_click`, …)
- [ ] Deploy to Vercel; wire domain when there is one
- [ ] Add "how to run web" section to root docs

---

## 3. Done criteria

- Landing loads dark, fast, in pt-BR, with the live chart moving in the hero.
- Every color on the page traces to a Volt Court token; green appears only on CTAs/reward moments.
- All numbers render in JetBrains Mono with `tabular-nums`.
- No claim on the page that the backend can't back yet (demo labeled as demo).
- A stranger scrolling for 10 seconds can answer: *what is it, how does it work, where do I get it.*
