# PRD — [NOME] (codinome: `oddsdex`)

**Tipo de documento:** PRD de produto — **escopo: aplicativo mobile apenas**
**Plataforma alvo:** Solana Seeker (Android + Solana Mobile Stack)
**Autor:** Pedro
**Status:** Draft v0.1
**Última atualização:** 2026-07-17

---

## 0. Como ler este doc

Este PRD cobre **só o app cliente**. Back-end (API, streaming de odds, matching, ledger off-chain) e smart contract (custódia, matching on-chain, settlement, payout) são de responsabilidade do outro dev e estão **fora do escopo** deste documento.

Como o app depende inteiramente desses dois sistemas, a seção mais importante aqui é a **§7 Contratos de interface** — é o handshake entre o que o app consome e o que o back-end/SC precisam expor. Se essa seção não estiver alinhada com o outro dev antes de começar, vocês vão construir peças que não encaixam.

---

## 1. Visão geral

### 1.1 Resumo
App mobile de **trading de odds de futebol** no modelo *fixed-time / opção binária* (inspirado no fluxo do OlympTrade), rodando na **Solana** com liquidação em **USDC** e distribuído via **dApp Store da Seeker**.

O usuário não aposta no resultado da partida. Ele aposta na **direção do movimento da odd** de um mercado, num intervalo de tempo fechado:

> "A odd de *Vitória do Time A* está em 2.10. Vai **subir** ou **descer** nos próximos 60s?"

Acertou a direção → recebe payout (`stake × multiplicador`). Errou → perde o stake. Simples, rápido, alto giro — a mesma dinâmica de retenção do OlympTrade, mas com underlying = odd ao vivo em vez de par de ativos.

### 1.2 Por que Seeker
- **Seed Vault**: assinatura on-device com biometria/hardware. Non-custodial sem fricção de seed phrase — a chave nunca sai do device.
- **Mobile Wallet Adapter (MWA)**: signing padronizado app↔wallet.
- **dApp Store**: distribuição sem as regras/rev-share da Play Store, e sem risco de takedown por ser app de "gambling/crypto" (que a Apple/Google costumam derrubar).
- Público já crypto-native e com USDC no bolso → onboarding curto.

### 1.3 Escopo do MVP em uma linha
App que conecta wallet, mostra odds ao vivo em tempo real, deixa o usuário abrir posição SOBE/DESCE em USDC assinando a tx via Seed Vault, acompanha a posição até o settlement e mostra o resultado/payout.

---

## 2. Escopo

### 2.1 Dentro do escopo (app)
- Onboarding + conexão de wallet (MWA / Seed Vault)
- Leitura de saldo USDC (ATA do usuário)
- Descoberta: lista de partidas/mercados (ao vivo e agendados)
- Tela de trade: gráfico da odd em tempo real, seletor de direção, stake, timeframe, payout estimado
- Construção e assinatura da transação de abertura de posição (MWA)
- Acompanhamento de posições abertas em tempo real (countdown + estado)
- Exibição de settlement/resultado e payout
- Histórico de posições
- Fluxo de depósito e saque de USDC
- Perfil, configurações, push notifications
- Estados de erro/loading/offline

### 2.2 Fora do escopo (outro dev)
- Smart contract (Anchor program): custódia de USDC, abertura/fechamento de posição, matching (P2P/pooled/house), settlement, payout, taxas
- Oracle / feed de odds e a fonte de verdade da odd de entrada e saída usada no settlement
- Back-end: ingestão de odds das casas/provedor, streaming em tempo real, API REST, indexer on-chain, cálculo de multiplicador/payout, KYC/compliance backend
- Liquidez / market making
- Infra de deploy, RPC, indexer

### 2.3 Fora do escopo (por ora — v2+)
- iOS
- Web app
- Outros esportes além de futebol
- Mercados pré-partida complexos, cash-out parcial, ordens limitadas

---

## 3. Premissas e dependências

| # | Premissa / dependência | Dono | Bloqueia |
|---|---|---|---|
| P1 | Back-end expõe stream de odds em tempo real (WebSocket) com latência < 1s | Outro dev | Tela de trade inteira |
| P2 | SC expõe instruções Anchor para `open_position` e resultado consultável on-chain | Outro dev | Fluxo de aposta |
| P3 | Existe fonte de verdade única para odd de entrada e saída, **idêntica** entre UI e SC | Outro dev | Confiança/UX do settlement |
| P4 | Multiplicador/payout é **cotado pelo back-end** e o app apenas exibe (app não calcula regra de negócio) | Outro dev | Tela de trade |
| P5 | Custódia é non-custodial: USDC do usuário em ATA/PDA controlado pelo SC, nunca por servidor | Outro dev | Modelo de depósito/saque |
| P6 | Seeker Wallet (ou wallet MWA-compatível) presente no device | Solana Mobile | Signing |
| P7 | Settlement é determinístico e verificável on-chain (o app consegue provar o resultado ao usuário) | Outro dev | Tela de resultado |

> **Decisão a fechar com o outro dev antes de codar:** o modelo de matching (P2P entre usuários, pool, ou contra a casa) define de onde vem o multiplicador e se a odd de payout é fixa no momento da entrada ou variável. Isso muda a UI da tela de trade.

---

## 4. Personas e user stories

**Persona primária — "Trader de giro alto"**
Crypto-native, tem USDC, curte apostar/tradar, quer sessões rápidas de 30s–5min, decisão instantânea, sem burocracia de KYC pesado. Já usou Stake/OlympTrade/perp DEX.

User stories núcleo:
- Como usuário, quero **conectar minha wallet em 1 tap** e ver meu saldo USDC.
- Como usuário, quero ver **partidas ao vivo com odds se movendo** para escolher onde entrar.
- Como usuário, quero **apostar SOBE ou DESCE** num valor e prazo, ver o **payout antes de confirmar**, e assinar rápido.
- Como usuário, quero **acompanhar minha posição em tempo real** com um countdown claro.
- Como usuário, quero ver **na hora se ganhei ou perdi** e o payout creditado.
- Como usuário, quero **sacar meu USDC** quando quiser.

---

## 5. Mecânica do produto (spec da aposta)

Esta é a lógica que a UI precisa representar. As **regras** vivem no SC/back-end; o app **exibe e coleta input**.

### 5.1 Underlying
A série tradeable é a **odd decimal de uma seleção específica de um mercado de uma partida**, transmitida ao vivo (in-play), variando em tempo real.
Ex.: partida `Palmeiras x Flamengo`, mercado `1X2`, seleção `Palmeiras vence`, odd atual `2.10`.

### 5.2 Parâmetros da posição (input do usuário)
- **Direção**: `SOBE` | `DESCE`
- **Stake**: valor em USDC (com min/max vindos do back-end)
- **Timeframe / expiry**: janela de fechamento (ex.: 30s, 1min, 5min) — set vindo do back-end

### 5.3 Settlement
No expiry, compara-se `odd_saída` vs `odd_entrada` (ambas da fonte de verdade do §P3):
- `SOBE` acerta se `odd_saída > odd_entrada`
- `DESCE` acerta se `odd_saída < odd_entrada`
- Acerto → `payout = stake × multiplicador`
- Erro → perde `stake`

### 5.4 Decisões abertas (precisam ser respondidas pelo outro dev p/ fechar a UI)
- **Empate** (`odd_saída == odd_entrada`): devolve stake? conta como perda? → afeta o texto/estado da tela de resultado.
- **Multiplicador**: fixo cotado na entrada, ou variável? Fonte = back-end (P4).
- **Payout proporcional à magnitude** do movimento, ou binário fixo? (OlympTrade é binário fixo — recomendo começar binário fixo pela simplicidade de UI.)
- **Suspensão de mercado** (gol, VAR, cartão → odd congela/some): a posição aberta continua, cancela, ou pausa o timer? → edge case crítico de UX (§10).

---

## 6. Fluxos principais

### 6.1 Onboarding + conexão de wallet
1. Splash → tela de valor (3 telas curtas, skippável)
2. `Conectar Wallet` → dispara **MWA `authorize`** → Seeker Wallet abre → usuário aprova
3. App recebe `publicKey` + `authToken` (persiste `authToken` p/ reconexão silenciosa)
4. App lê saldo USDC da ATA do usuário via RPC
5. Se saldo == 0 → CTA para **§6.5 Depósito**

### 6.2 Descoberta
1. Home lista partidas: tabs `Ao vivo` / `Em breve`
2. Cada card: times, placar, tempo de jogo, mercado em destaque + odd atual com **indicador de movimento** (▲/▼ + cor)
3. Tap no card → tela de trade

### 6.3 Trade (tela núcleo)
1. Header: partida + mercado + seleção
2. **Gráfico da odd em tempo real** (linha/candle, atualização sub-segundo via WS)
3. Odd atual grande + delta recente
4. Seletor **SOBE / DESCE** (dois botões grandes, verde/vermelho)
5. Input de **stake** (teclado numérico + chips 5/10/25/50 USDC + "Max")
6. Seletor de **timeframe**
7. **Payout estimado** exibido em tempo real (`stake × multiplicador`, cotado pelo back-end)
8. `Confirmar` → monta a instrução `open_position` → **MWA `signAndSendTransactions`** → Seed Vault (biometria)
9. Estado otimista: posição aparece como `Pendente` até confirmação on-chain; depois `Aberta`
10. Erro de tx → toast + reversão do estado otimista

### 6.4 Acompanhar posição + resultado
1. Aba `Posições`: lista de posições abertas com **countdown** + odd atual vs odd de entrada + indicador "no lucro/no prejuízo" (indicativo, não é o settlement)
2. No expiry: app detecta o resultado on-chain (evento/conta) → transição para `WIN` / `LOSS`
3. Tela/sheet de resultado: odd entrada → odd saída, direção, stake, payout, link pro explorer (verificabilidade §7.2)
4. Payout creditado reflete no saldo

### 6.5 Depósito
1. Não-custodial: depósito = enviar USDC para a ATA do usuário / vault do SC (confirmar modelo com P5)
2. Opções: receber via endereço/QR, e (v1.1) on-ramp/bridge — **fora do MVP**, começar só receber USDC

### 6.6 Saque
1. `Sacar` → valor → assina tx de retirada (instrução do SC) via MWA/Seed Vault
2. Confirmação + estado

### 6.7 Perfil / config
Endereço, saldo, histórico, notificações, links legais, disconnect.

---

## 7. Contratos de interface (a parte que evita retrabalho)

O app consome **três superfícies**: API REST, WebSocket, e programa on-chain. Alinhar isto com o outro dev **antes** de qualquer linha de código. Os schemas abaixo são proposta — ajustar juntos.

### 7.1 API REST (back-end)
Endpoints mínimos que o app precisa:

```
GET  /matches?status=live|upcoming        → lista de partidas + mercado destaque
GET  /matches/{id}                         → detalhe + mercados + seleções
GET  /markets/{id}/quote                   → { multiplicador, min_stake, max_stake, timeframes[] }
GET  /positions?wallet={pubkey}            → posições (fonte de verdade indexada do on-chain)
GET  /positions/{id}                       → detalhe + odd_entrada, odd_saida, resultado
GET  /wallet/{pubkey}/balance              → saldo USDC (ou app lê direto do RPC)
```

Contrato crítico: `/markets/{id}/quote` é a fonte do **payout exibido**. O app **nunca** calcula multiplicador — só renderiza o que vem daqui.

### 7.2 WebSocket (streaming de odds)
```
SUB  match:{id}:market:{id}   → { selection_id, odd, ts, movement, status }
```
- `odd`: decimal atual
- `ts`: timestamp (server) — usado pra render do gráfico e delta
- `status`: `open | suspended | closed` — dispara o edge case de suspensão (§10)
- Requisitos: latência < 1s, reconexão automática, snapshot no `SUB` + deltas depois

### 7.3 On-chain (smart contract — Anchor)
O app precisa que o outro dev exponha e documente:

**Instruções que o app monta e assina:**
- `open_position(market_id, selection_id, direction, stake, expiry_bucket)` → o app constrói a tx, usuário assina via Seed Vault
- `withdraw(amount)`

**Estado que o app lê:**
- Estrutura da **conta de posição** (PDA): `owner`, `market`, `selection`, `direction`, `stake`, `odd_entry`, `expiry`, `status`, `odd_exit`, `payout`
- Derivação dos PDAs (seeds) para o app conseguir localizar as contas do usuário sem depender só do indexer
- **Eventos/logs** de `PositionOpened` / `PositionSettled` para reagir a settlement em tempo real
- Mint do USDC usado (mainnet: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` — **confirmar**)

**Verificabilidade:** o app deve conseguir provar ao usuário o resultado apontando pra tx/conta on-chain no explorer. Isso exige que `odd_entry` e `odd_exit` estejam **on-chain** ou verificáveis, não só num banco off-chain.

### 7.4 Solana Mobile / Seed Vault
- **MWA**: `authorize` / `reauthorize` / `signAndSendTransactions`
- Persistir `authToken` p/ reconexão silenciosa
- Signing 100% via wallet (Seed Vault) — o app **nunca** toca em chave privada
- Suportar cenário "sem wallet MWA instalada" → deep link / mensagem

---

## 8. Arquitetura do app (client-side)

### 8.1 Stack recomendada
- **React Native + Expo** com Solana Mobile SDK (`@solana-mobile/mobile-wallet-adapter-protocol` + `...-web3js`) e `@solana/web3.js`.
  - Prós: velocidade de build, ecossistema, teu histórico de iteração rápida.
  - Contra: gráfico real-time performático exige `@shopify/react-native-skia` + `react-native-reanimated` (JS thread não aguenta sub-segundo com re-render ingênuo).
- **Alternativa**: Kotlin nativo + `com.solana:mobile-wallet-adapter`. Melhor pro gráfico/latência, mais lento de construir. Só justifica se o gráfico virar gargalo real.

> Recomendação: RN + Expo, com o **gráfico isolado em Skia** desde o dia 1. Não subestimar a renderização do stream — é o ponto onde apps de trading em RN quebram.

### 8.2 Camadas
- **Wallet/session**: MWA, authToken, saldo
- **Realtime**: cliente WS (odds), com buffer/decimation p/ o gráfico + reconnect
- **Chain**: web3.js, construção de tx, leitura de contas/PDAs, subscription de logs
- **Domain/state**: máquina de estado da posição (`idle → building → pending → open → settling → settled`), catálogo de partidas/mercados
- **UI**: telas + design system

### 8.3 State management
Máquina de estados explícita por posição (evita o inferno de estado otimista vs confirmado). Sugerido: Zustand + XState (ou reducer disciplinado) pra o ciclo de vida da posição. O estado otimista da tx tem que ser reconciliável com o on-chain — a fonte de verdade final é sempre a conta on-chain, não o cliente.

---

## 9. Requisitos funcionais por tela

| Tela | Requisitos |
|---|---|
| **Onboarding** | Value props skippáveis; CTA conectar wallet; tratar "sem wallet" |
| **Home/Descoberta** | Tabs ao vivo/em breve; cards com odd + movimento; refresh; empty/loading states |
| **Trade** | Gráfico real-time; SOBE/DESCE; stake (chips + max + validação min/max); timeframe; payout estimado ao vivo; confirmar + signing; estado otimista + reversão |
| **Posições** | Lista abertas com countdown; odd atual vs entrada; indicador PnL indicativo; transição p/ resultado |
| **Resultado** | WIN/LOSS; entrada→saída; stake; payout; link explorer |
| **Histórico** | Posições encerradas paginadas; filtros básicos |
| **Depósito** | Endereço/QR; instruções; (v1.1 on-ramp) |
| **Saque** | Valor; assinar; confirmação/estado |
| **Perfil** | Endereço, saldo, notificações, legais, disconnect |

---

## 10. Estados de erro e edge cases

Estes definem se o app parece confiável ou quebrado. Cada um precisa de comportamento definido **com o outro dev**:

- **Mercado suspende** (`status: suspended`) enquanto o usuário está na tela de trade → desabilitar botão de aposta, banner "mercado suspenso".
- **Suspensão com posição aberta** (gol/VAR durante o timer) → **decisão de negócio pendente (§5.4)**: continua/cancela/pausa. UI depende disso.
- **Tx falha / rejeitada / timeout** → reverter estado otimista, toast claro, sem debitar.
- **WS cai** → banner "reconectando", gráfico congela com timestamp do último dado, bloqueia nova aposta até reconectar.
- **Saldo insuficiente** → validação antes de assinar.
- **Partida encerra** durante posição aberta → regra de settlement (do SC) + estado de UI.
- **Odd de entrada exibida ≠ odd que o SC registrou** (slippage entre tap e confirmação) → precisa de política: rejeita se moveu além de X? mostra a odd real registrada no resultado? **Decidir.**
- **Relógio**: usar sempre o `ts` do servidor, nunca o relógio do device, pro countdown e settlement.

---

## 11. Requisitos não-funcionais

- **Latência de odds**: gráfico reflete update em < 1s; sem travar a UI thread.
- **Performance do gráfico**: 60fps com stream sub-segundo (Skia/decimation).
- **Resiliência**: reconexão WS automática; reconciliação de estado com o on-chain no foreground.
- **Segurança**: non-custodial; chave só no Seed Vault; app nunca persiste segredo; nada de custódia server-side.
- **Confiabilidade do settlement**: fonte de verdade = on-chain; UI otimista sempre reconciliável.
- **Offline/erro**: todo fetch tem loading/empty/error.
- **Acessibilidade**: alvos de toque ok, contraste (verde/vermelho + ícone/label, não só cor).

---

## 12. Telemetria / analytics

Eventos mínimos: `wallet_connected`, `deposit_initiated`, `match_opened`, `trade_screen_viewed`, `position_open_attempted`, `position_open_signed`, `position_open_confirmed`, `position_settled` (com win/loss), `withdraw_initiated`, erros de tx/WS.
Funil-chave: `trade_screen_viewed → position_open_confirmed` (conversão) e `first_deposit → first_trade` (ativação). Alto giro é o modelo — instrumentar tempo entre trades e frequência de sessão.

---

## 13. Segurança

- Signing exclusivamente via MWA/Seed Vault; app é non-custodial.
- Nunca logar `publicKey` em analytics de terceiros sem anonimizar.
- Validar todo dado do WS/API antes de renderizar (não confiar cego no back-end pra valores exibidos que viram input de tx).
- A tx é montada no cliente mas o usuário vê e assina no wallet — garantir que o resumo da tx no wallet seja legível.

---

## 14. Compliance e responsible gambling (breve — validar com jurídico)

Não é escopo de engenharia do app, mas o produto se enquadra como **aposta/jogo de quota** e isso condiciona features da UI. Pontos que provavelmente exigem tela/flag no app:

- **Age-gate 18+** no onboarding.
- **Geo-restrição**: mercado-alvo e jurisdições bloqueadas. No Brasil, apostas de quota fixa são reguladas pela Lei 14.790/2023 — o enquadramento "trading de odds" vs "aposta" precisa de parecer jurídico.
- **Ferramentas de jogo responsável**: limites de depósito/tempo, auto-exclusão, links de ajuda — costumam ser requisito regulatório e a UI precisa suportar.
- Binary options têm restrição/proibição pra varejo em várias jurisdições (ex.: EU/ESMA). Definir mercados servidos cedo, porque muda copy e gating.

> Deixado explícito aqui só pra não virar surpresa no fim — decisão de produto/jurídico, não de eng.

---

## 15. Roadmap / fases

**Fase 0 — Alinhamento de interface (§7)**
Fechar schemas API/WS/on-chain e as decisões abertas do §5.4/§10 com o outro dev. Bloqueia tudo.

**Fase 1 — MVP**
Conectar wallet · saldo · descoberta ao vivo · tela de trade (SOBE/DESCE, stake, timeframe, payout) · abrir posição assinada · acompanhar · resultado · histórico · receber USDC · sacar.

**Fase 2 — v1**
Push notifications de settlement · on-ramp/bridge · melhorias de gráfico · jogo responsável · geo/age-gating completo.

**Fase 3 — v2+**
iOS, outros esportes, cash-out/ordens avançadas.

---

## 16. Questões em aberto

1. Modelo de matching (P2P/pool/house) → define fonte do multiplicador e se odd de payout é fixa na entrada. **(§3, §5.4)**
2. Tratamento de empate na odd. **(§5.4)**
3. Comportamento de posição aberta durante suspensão de mercado. **(§5.4, §10)**
4. Política de slippage entre odd exibida e odd registrada on-chain. **(§10)**
5. `odd_entry`/`odd_exit` ficam on-chain (verificável) ou só off-chain? **(§7.3)**
6. Modelo de custódia exato do depósito (ATA do user vs vault PDA). **(§3-P5, §6.5)**
7. Enquadramento jurídico e jurisdições servidas. **(§14)**
8. Set de timeframes e min/max de stake no MVP. **(§7.1)**

---

*Fim do PRD do app. Back-end e smart contract em documentos separados (outro dev).*