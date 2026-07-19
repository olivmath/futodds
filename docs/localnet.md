# Localnet Runbook

## Current Local IDs

| Item | Value |
|---|---|
| RPC | `http://127.0.0.1:8899` |
| Backend | `http://127.0.0.1:8787` |
| Frontend | `http://127.0.0.1:5173` |
| `oracle_adapter` | `BfWcrr3Mv4StpqSyaMUZtsLLUTM9cLkNeaARRdwSFSCN` |
| `betting_engine` | `FBXnZZHR3ndsE2oYak4EQaFTPZsEC7d34C8tQfE7hkm4` |
| `liquidity_pool` | `B4LZJT28Ucqe3eCpSrhQCiBhZ2dfCxH1eMVWfQqShgy9` |
| Test USDC mint | `Gemud42VXfBFPm4HhdSfeG8MoFBjsAsEDitza6muv3yx` |

Fase 2 usa `Pool` e `LpPosition` ativos dentro de `betting_engine`. O programa `liquidity_pool` existe no workspace como scaffold/teste isolado.

## Start From Clean Localnet

```bash
solana config set --url http://127.0.0.1:8899
solana-test-validator --reset
```

In another terminal:

```bash
anchor keys sync
anchor build
anchor deploy
```

If the validator was reset and a new mint is needed:

```bash
spl-token create-token --decimals 6
```

Copy the mint address into:

```txt
backend/.env.local
app/.env.local
```

## Start Backend And Frontend

```bash
cd backend
npm run start:local
```

```bash
cd app
npm run dev:local
```

## Wallet Setup

| Step | Action |
|---|---|
| 1 | Set Phantom/Solflare network to `http://127.0.0.1:8899` |
| 2 | Copy the wallet public key |
| 3 | Fund SOL: `solana airdrop 10 <WALLET_PUBLIC_KEY>` |
| 4 | Open `http://127.0.0.1:5173` and connect wallet |
| 5 | Create token account: `spl-token create-account <MINT> --owner <WALLET_PUBLIC_KEY>` |
| 6 | Mint test USDC: `spl-token mint <MINT> 100 --recipient-owner <WALLET_PUBLIC_KEY>` |

The mint authority is the local CLI wallet, not the browser wallet. The app's dev mint button only works if the connected browser wallet is also the mint authority.

## Smoke Test

```bash
curl http://127.0.0.1:8787/health
curl -X POST http://127.0.0.1:8787/poller/start
curl http://127.0.0.1:8787/status
```

Expected:

```txt
health.ok = true
blockchain.rpcUrl = http://127.0.0.1:8899
recent tx type = update_odds
```
