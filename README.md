# FutOdds

Binary options on live sports odds — Solana x TxODDS

> World Cup Hackathon 2026 — Superteam / TxODDS

## Architecture

- [System Overview](https://claude.ai/code/artifact/f839c2ba-06fe-4377-bb85-1dec0ade528d) — layers, sequences, tokenomics, risk control
- [Smart Contracts](https://claude.ai/code/artifact/0ff962ad-0836-4878-96df-70f869d0e599) — PDAs, instructions, CPI map, validations, error codes

## Concept

Users bet whether live match odds will go **UP** or **DOWN** within a time window (1/5/10/20 min). Liquidity providers fund the pool and earn fees.

## Tech Stack

| Layer | Tech |
|---|---|
| Smart Contracts | Solana (Anchor) |
| Odds Feed | TxODDS / TxLINE API |
| Token | USDC |
| Backend | JS + Express |
| Realtime | Solana RPC WebSocket logs |

## Project Structure

```
programs/
  oracle-adapter/    # Writes/reads odds on-chain
  betting-engine/    # place_bet, settle_bet, cancel_bet (planned)
  liquidity-pool/    # Pool, LP shares, fees (planned)
backend/
  src/                # Express server, odds poller, settlement worker
app/
  src/                # Testnet console and Solana realtime parser
docs/
  fase-0-oracle.md   # Phase plans with test matrices
  fase-1a-place-bet.md
  ...
```

## Phases

| Phase | Description | Status |
|---|---|---|
| 0 | Oracle Smoke Test | Done |
| 1a | place_bet with escrow | Pending |
| 1b | settle_bet | Pending |
| 1c | Backend oracle + canonical realtime | In progress |
| 2a | Pool + deposit | Pending |
| 2b | Integrate betting with pool | Pending |
| 2c | withdraw + claim_fees | Pending |
| 3a | Dynamic payout | Pending |
| 3b | Exposure limit 80% | Pending |
| 3c | cancel_bet | Pending |
| 4 | Backend + TxODDS integration | Pending |

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

## Backend

```bash
cd backend
npm install
npm test
npm start
```

Endpoints:

| Method | Route |
|---|---|
| `GET` | `/health` |
| `GET` | `/status` |
| `GET` | `/matches` |
| `POST` | `/poller/start` |
| `POST` | `/poller/stop` |
| `POST` | `/settlement/run-once` |
