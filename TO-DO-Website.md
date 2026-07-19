# TO-DO-Website.md — oddsdex landing + investor panel (`website/`)

> **Status: implementado.** Landing em inglês + seção Investors + painel `/investors` mockado.
> Idioma: **English** (decisão de 2026-07-19; copy pt-BR foi substituída).

**Objetivo:** landing page em `website/` clonando a estrutura visual de **olymptrade.com** (refs: `imgs-web/image*.png`), com o brand **Volt Court** (`mobile-seeker/brand.md`, verbatim — nunca forkar a paleta).

**Stack:** Next.js (App Router) + TypeScript + Tailwind. Fontes: Inter (UI) + JetBrains Mono (números) via `next/font/google`.

**Regras de brand (não negociáveis):**
- Fundo `#081310` (nunca `#000000` puro), superfícies `#0F1E18`
- Verde elétrico `#2FE083` SÓ em CTAs/recompensa (dopamine rule); gradiente CTA `#00E5C9 → #2FE083`
- Linha de gráfico sempre **cyan** `#41D9E8` (nunca verde/vermelho antes de settlement)
- Todo número em JetBrains Mono `tabular-nums`
- Sem `transition-all`, sem badges/estatísticas inventadas sem rótulo de demo

---

## Seções (mapeadas 1:1 das screenshots)

- [ ] **0. Scaffold** — `create-next-app` em `website/`, tokens Volt Court em `globals.css`, fontes wired no layout
- [ ] **1. Navbar** (todas as imgs) — logo à esquerda; nav central em pill escura (Negociação · Baixar o app · Sobre · Ajuda); à direita: bandeira 🇧🇷, botão "Entrar" (cinza escuro), CTA verde "Experimente de graça"; fixa no topo
- [ ] **2. Hero** (`image.png`) — fundo near-black com silhuetas de barras de gráfico subindo; headline central grande "Aumente sua confiança a cada negociação"; CTA verde "Comece agora com R$ 0"; link "Saiba mais ›" verde; fileira de chips com emoji (🔥 Plataforma moderna · 🥰 Recursos úteis · 🏁 Começo fácil · 📚 Central de aprendizagem · 💸 Saques rápidos · 🛡️ Corretora confiável)
- [ ] **3. Plataforma** (`image copy.png`) — título "Plataforma de negociação moderna"; mockup de celular na mão com UI de trading (gráfico candlestick/linha AO VIVO em cyan, painel Buy/Sell, tab bar); cartão verde com QR code "Seu futuro financeiro está em suas mãos → Baixe o app agora"
- [ ] **4. Bento de instrumentos** (`image copy 2.png`) — título "Explore a negociação com instrumentos sem riscos"; grid bento: card grande "Conta demo projetada para praticar" (CTA verde + dropdown de contas), card "Negociações sem riscos" (mini-gráfico com pill $10.00), card "Depósitos assegurados", card "Proteção contra saldo negativo" (toggle verde), card "Stop loss/Take profit"
- [ ] **5. Licença/confiança** (`image copy 3.png`) — "A oddsdex é uma corretora online licenciada e regulamentada" → adaptar honesto: trust = tech (Solana, non-custodial, USDC); badges monocromáticos; visual 3D do logo com glow verde
- [ ] **6. Prova social + awards** (`image copy 4.png`) — carrossel de depoimentos (card escuro com avatar + texto) ao lado do card "11 anos de excelência" → adaptar; **CTA gigante em gradiente** (`#00E5C9 → #2FE083`) "Comece a negociar com confiança"; 3 colunas de texto SEO abaixo
- [ ] **7. Footer** (`image copy 5.png`) — "Siga-nos nas redes sociais" + ícones circulares (Facebook, Instagram, Telegram, YouTube); card QR repetido; colunas de links; disclaimer de risco (tom honesto do brand.md)
- [x] **8. Cookie banner** — canto inferior esquerdo, pill escura com botão "Ok"
- [x] **9. Motion & polish** — entrance choreography (stagger no hero), reveals por scroll (once), gráfico animado por canvas/RAF; enter ~300ms
- [x] **10. SEO/meta** — title, description, OG, favicon; `lang="en"`
- [ ] **11. QA** — legível a 360px; Lighthouse ≥ 95; nenhum `#000000`/`transition-all` no código

## Investor (adicionado 2026-07-19)

- [x] **Seção "For investors"** na landing (`#investors`, tab na navbar): 3 passos (deposit → pool = counterparty → fees/withdraw) + strip de stats (2% fee, 1.5/0.5 split, 80% exposure, 60s) + CTA gradiente → `/investors`
- [x] **Painel `/investors`** (mockado, alinhado ao backend): stats strip (TVL, my positions, claimable fees), tabela de pools por partida (status live/open/settled, TVL, locked, unlocked %, my value), detalhe do pool (métricas, barra de exposure UP cyan / DOWN red, share price), fluxo **deposit** (chips 100/500/1000/Max, preview de shares = `amount × total_shares ÷ total_liquidity`, mínimo 100, risk disclosure), **withdraw** limitado ao unlocked, **claim fees**, mock de wallet + lifecycle de tx (building → pending → confirmed)
- [x] Tipos em `lib/pools.ts` espelham os schemas on-chain (`Pool`, `LpPosition` — docs/fase-2a) e o contrato REST futuro (`GET /pools`) — troca por reads reais é drop-in
- [ ] Trocar mocks por wallet-adapter + IDL quando a Fase 2a do programa `liquidity-pool` estiver no devnet

## Done criteria
- Estrutura idêntica seção a seção às 6 screenshots, com paleta Volt Court.
- Gráfico do hero/phone se movendo (cyan), números em mono.
- `npm run dev` sobe e a página inteira renderiza sem erro.
