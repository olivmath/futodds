# FutOdds — oddsdex

Binary options on live sports odds — Solana × TxODDS

> World Cup Hackathon 2026 — Superteam / TxODDS

## Concept

Users trade whether a team's **live odd** will go **UP** or **DOWN** within a fixed time window (1/5/10/15 min) — not the match result. Bets settle in **USDC on Solana** with a 1.8× payout. Liquidity providers fund per-match pools and earn 75% of fees (25% to the protocol). Non-custodial: users sign every transaction themselves (Phantom/Solflare on web, Mobile Wallet Adapter / Seed Vault on the Solana Seeker); the backend only signs odds writes and settlements.

## Documentation

- [Technical documentation](docs/TECHNICAL-DOCUMENTATION.md) — full reference: contracts, backend, console, mobile, website, flows, environments
- [Demo runbook (ARG × ESP)](docs/demo-arg-esp.md) — recordable end-to-end demo: scripted odds on testnet, real on-chain bet signed on the phone via MWA, automatic settlement
- [System Overview](https://claude.ai/code/artifact/f839c2ba-06fe-4377-bb85-1dec0ade528d) — layers, sequences, tokenomics, risk control
- [Smart Contracts](https://claude.ai/code/artifact/0ff962ad-0836-4878-96df-70f869d0e599) — PDAs, instructions, CPI map, validations, error codes

## Repository Components

| Directory | Component | Stack |
|---|---|---|
| `programs/oracle-adapter/` | On-chain odds oracle (`update_odds`) | Rust / Anchor |
| `programs/betting-engine/` | Bets + liquidity pool (`place_bet`, `settle_bet`, `create_pool`, `deposit`, `withdraw`, `claim_fees`) | Rust / Anchor |
| `programs/liquidity-pool/` | Standalone pool scaffold (not used by the betting flow) | Rust / Anchor |
| `backend/` | Admin API, odds poller (TxLINE / scripted / random), settlement worker | Node.js + Express |
| `app/` | Operator backoffice / testnet console | Vite + React + TS |
| `mobile-seeker/` | Android app for the Solana Seeker (live odds + MWA wallet) | Kotlin + Jetpack Compose |
| `website/` | Landing page + investor (LP) panel + **APK download** | Next.js 16 + React 19 + Tailwind v4 |
| `docs/` | Phase plans, deploy guides, demo runbook | Markdown |

## Download the App (Seeker)

The website serves the Android APK directly — every download CTA on the landing page points to it:

```
website/public/oddsdex-seeker.apk   →  https://<site>/oddsdex-seeker.apk
```

Current file: `demo` flavor (testnet, debug-signed, ~65 MB), sideload-installable on any Android 12+ device. To refresh it after a new build:

```bash
cd mobile-seeker && ./gradlew :app:assembleDemoDebug
cp app/build/outputs/apk/demo/debug/app-demo-debug.apk ../website/public/oddsdex-seeker.apk
```

## Deployments

Programs on Solana **testnet** (see `Anchor.toml`):

| Program | Program ID |
|---|---|
| `oracle_adapter` | `Df1gfgegKEBJvKtyHdxUiwaohUkDQj9Pigdpgszk7XUL` |
| `betting_engine` | `H3ekojbWVFfzYnTmiNUejMkiB2pEQuf6wyH7QyyMQkz1` |
| `liquidity_pool` | `3jeWz6WQaM8DG5jRqoVff4FtsMVRjg9peGGMjjgUYRMY` |

```bash
solana program show Df1gfgegKEBJvKtyHdxUiwaohUkDQj9Pigdpgszk7XUL --url https://api.testnet.solana.com
solana program show H3ekojbWVFfzYnTmiNUejMkiB2pEQuf6wyH7QyyMQkz1 --url https://api.testnet.solana.com
```

| Component | Where |
|---|---|
| Backend | AWS EC2 — `18.191.145.46:8787` (ECS Fargate planned, `docs/aws-deploy-backend-data.md`) |
| Website | Vercel (project `futodds`) |
| Mobile | Solana dApp Store target (Seeker); APK served by the website |
| Test USDC mint (devnet/testnet) | `CDAQWBQ3DciCWQDtyczAWvTp3xuyuL2t273LSdffjxB` |

## Phases

| Phase | Description | Status |
|---|---|---|
| 0 | Oracle smoke test | Done |
| 1a | `place_bet` with escrow | Done |
| 1b | `settle_bet` | Done |
| 1c | Backend oracle + canonical realtime events | Done |
| 2a | Pool + `deposit` | Done |
| 2b | Betting integrated with pool | Done |
| 2c | `withdraw` + `claim_fees` | Done |
| 3a | Dynamic payout (UP/DOWN ratio) | Pending |
| 3b | Exposure limit 80% | Pending |
| 3c | `cancel_bet` | Pending |
| 4 | Backend + TxODDS/TxLINE integration | Done |

## Setup

```bash
# Install Solana CLI
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"

# Install Anchor CLI
cargo install --git https://github.com/coral-xyz/anchor avm --force
avm install latest

# Build
anchor build --ignore-keys

# Test
cargo test
cd app && npm test && npm run build
cd ../backend && npm test
```

For a full local validator deploy with backend, frontend, and browser wallet, use [`docs/localnet.md`](docs/localnet.md).

### Backend

```bash
cd backend
npm install
npm test
npm start        # or: pnpm dev (auto-restart)
```

Main endpoints:

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/health` · `/status` | Liveness / runtime status |
| `GET` | `/matches` · `/leagues` · `/fixtures` | Match & TxLINE catalog data |
| `POST` | `/matches` · `/matches/:id/source` · `/matches/:id/close` · `/matches/:id/timeline` | Create/control matches (3 odds modes: `txline`, `scripted`, `random`) |
| `GET` | `/pools` · `/pools/positions/:owner` | Pool metrics and LP positions |
| `POST` | `/faucet` | Fund a wallet with fee SOL + demo USDC |
| `POST` | `/poller/start` · `/poller/stop` | Odds poller control |
| `POST` | `/settlement/start` · `/settlement/stop` · `/settlement/run-once` | Settlement worker control |
| `POST` | `/stream/start/:id` · `/stream/stop/:id` · `/stream/resume/:id` — `GET /stream/status` | Per-match odds streaming |

### Website

```bash
cd website
npm install
npm run dev      # http://localhost:3000
```

### Mobile (Seeker)

```bash
cd mobile-seeker
./gradlew installDevnetDebug     # day-to-day dev (devnet flavor)
```

See [`mobile-seeker/README.md`](mobile-seeker/README.md) for device setup and flavors, and [`docs/demo-arg-esp.md`](docs/demo-arg-esp.md) for the demo flavor pointed at a local backend.
