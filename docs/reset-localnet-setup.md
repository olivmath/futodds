# Reset Localnet Setup

## Wallets


| Role             | Public key                                     |
| ---------------- | ---------------------------------------------- |
| Deploy authority | `CvReCDqGVKDU9i1ZF8WZy1NUbdZrZVs423FPFiNB3kyj` |
| User 1           | `4jA7EqUwJunWw8HACbgSDxGWDZRwR6naRRkrdj2mpYfn` |
| User 2           | `dj3MrNNHGSGYqnw32cCDJveEStHnrHDnYM12oVEB4Jv`  |


## Programs


| Program          | Localnet ID                                    |
| ---------------- | ---------------------------------------------- |
| `oracle_adapter` | `BfWcrr3Mv4StpqSyaMUZtsLLUTM9cLkNeaARRdwSFSCN` |
| `betting_engine` | `FBXnZZHR3ndsE2oYak4EQaFTPZsEC7d34C8tQfE7hkm4` |
| `liquidity_pool` | `B4LZJT28Ucqe3eCpSrhQCiBhZ2dfCxH1eMVWfQqShgy9` |


## 1. Start Clean Blockchain

Terminal 1:

```bash
solana config set --url http://127.0.0.1:8899
solana-test-validator --reset
```

Terminal 2:

```bash
cd /Users/olivmath/Documents/dev/solana-hacka-fut
solana config set --url http://127.0.0.1:8899
solana config get
```

## 2. Check Deploy Wallet

```bash
solana address
```

Expected:

```text
CvReCDqGVKDU9i1ZF8WZy1NUbdZrZVs423FPFiNB3kyj
```

If it is different, point the CLI to the deploy wallet keypair:

```bash
solana config set --keypair ~/.config/solana/id.json
solana address
```

## 3. Fund SOL

```bash
solana airdrop 20 CvReCDqGVKDU9i1ZF8WZy1NUbdZrZVs423FPFiNB3kyj
solana airdrop 10 4jA7EqUwJunWw8HACbgSDxGWDZRwR6naRRkrdj2mpYfn
solana airdrop 10 dj3MrNNHGSGYqnw32cCDJveEStHnrHDnYM12oVEB4Jv

solana balance CvReCDqGVKDU9i1ZF8WZy1NUbdZrZVs423FPFiNB3kyj
solana balance 4jA7EqUwJunWw8HACbgSDxGWDZRwR6naRRkrdj2mpYfn
solana balance dj3MrNNHGSGYqnw32cCDJveEStHnrHDnYM12oVEB4Jv
```

## 4. Build And Deploy Programs

```bash
anchor keys sync

anchor build -p oracle_adapter
anchor build -p betting_engine
anchor build -p liquidity_pool

anchor deploy
```

Verify:

```bash
solana program show BfWcrr3Mv4StpqSyaMUZtsLLUTM9cLkNeaARRdwSFSCN
solana program show FBXnZZHR3ndsE2oYak4EQaFTPZsEC7d34C8tQfE7hkm4
solana program show B4LZJT28Ucqe3eCpSrhQCiBhZ2dfCxH1eMVWfQqShgy9
```

## 5. Create Test USDC Mint

```bash
spl-token create-token --decimals 6
```

Copy the token address printed by the command:

```bash
export TEST_USDC_MINT="<PASTE_NEW_MINT_ADDRESS>"
echo "$TEST_USDC_MINT"
```

Check mint:

```bash
spl-token display "$TEST_USDC_MINT"
```

## 6. Create Token Accounts

```bash
spl-token create-account "$TEST_USDC_MINT" \
  --url http://127.0.0.1:8899 \
  --fee-payer ~/.config/solana/id.json \
  --owner CvReCDqGVKDU9i1ZF8WZy1NUbdZrZVs423FPFiNB3kyj

spl-token create-account "$TEST_USDC_MINT" \
  --url http://127.0.0.1:8899 \
  --fee-payer ~/.config/solana/id.json \
  --owner 4jA7EqUwJunWw8HACbgSDxGWDZRwR6naRRkrdj2mpYfn

spl-token create-account "$TEST_USDC_MINT" \
  --url http://127.0.0.1:8899 \
  --fee-payer ~/.config/solana/id.json \
  --owner dj3MrNNHGSGYqnw32cCDJveEStHnrHDnYM12oVEB4Jv
```

If an account already exists, keep going and use the existing associated token account.

## 7. Mint Balances

```bash
spl-token mint "$TEST_USDC_MINT" 100000 \
  --recipient-owner CvReCDqGVKDU9i1ZF8WZy1NUbdZrZVs423FPFiNB3kyj

spl-token mint "$TEST_USDC_MINT" 1000 \
  --recipient-owner 4jA7EqUwJunWw8HACbgSDxGWDZRwR6naRRkrdj2mpYfn

spl-token mint "$TEST_USDC_MINT" 1000 \
  --recipient-owner dj3MrNNHGSGYqnw32cCDJveEStHnrHDnYM12oVEB4Jv
```

Verify:

```bash
spl-token accounts --owner CvReCDqGVKDU9i1ZF8WZy1NUbdZrZVs423FPFiNB3kyj
spl-token accounts --owner 4jA7EqUwJunWw8HACbgSDxGWDZRwR6naRRkrdj2mpYfn
spl-token accounts --owner dj3MrNNHGSGYqnw32cCDJveEStHnrHDnYM12oVEB4Jv
```

## 8. Configure Backend

```bash
cat >> backend/.env.local <<EOF
PORT=8787
SOLANA_RPC_URL=http://127.0.0.1:8899
ORACLE_KEYPAIR=~/.config/solana/id.json
ORACLE_PROGRAM_ID=BfWcrr3Mv4StpqSyaMUZtsLLUTM9cLkNeaARRdwSFSCN
BETTING_PROGRAM_ID=FBXnZZHR3ndsE2oYak4EQaFTPZsEC7d34C8tQfE7hkm4
TEST_USDC_MINT=$TEST_USDC_MINT
ODDS_SOURCE=generated
ODDS_POLL_INTERVAL_MS=60000
EOF
```

## 9. Configure Frontend

```bash
cat >> app/.env.local <<EOF
VITE_SOLANA_RPC_URL=http://127.0.0.1:8899
VITE_BACKEND_URL=http://127.0.0.1:8787
VITE_ORACLE_PROGRAM_ID=BfWcrr3Mv4StpqSyaMUZtsLLUTM9cLkNeaARRdwSFSCN
VITE_BETTING_PROGRAM_ID=FBXnZZHR3ndsE2oYak4EQaFTPZsEC7d34C8tQfE7hkm4
VITE_TEST_USDC_MINT=$TEST_USDC_MINT
EOF
```

## 10. Seed Match And Pool

This prepares one match and one funded pool for betting tests.

```bash
cd backend
node --input-type=module <<'NODE'
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const RPC_URL = "http://127.0.0.1:8899";
const WALLET_PATH = "~/.config/solana/id.json";
const MATCH_ID = "futodds-demo-1";
const TAG = "Localnet Demo";
const FEE_RATE_BPS = 200;
const DEPOSIT_AMOUNT = 50_000n * 1_000_000n;

const ORACLE_PROGRAM_ID = new PublicKey("BfWcrr3Mv4StpqSyaMUZtsLLUTM9cLkNeaARRdwSFSCN");
const BETTING_PROGRAM_ID = new PublicKey("FBXnZZHR3ndsE2oYak4EQaFTPZsEC7d34C8tQfE7hkm4");
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const MINT = new PublicKey(process.env.TEST_USDC_MINT);

function expandHome(filePath) {
  return filePath.startsWith("~/") ? path.join(os.homedir(), filePath.slice(2)) : filePath;
}

function keypair(filePath) {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(expandHome(filePath), "utf8"))));
}

function discriminator(name) {
  return crypto.createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

function stringBytes(value) {
  const bytes = Buffer.from(value, "utf8");
  const out = Buffer.alloc(4 + bytes.length);
  out.writeUInt32LE(bytes.length, 0);
  bytes.copy(out, 4);
  return out;
}

function u16(value) {
  const out = Buffer.alloc(2);
  out.writeUInt16LE(value, 0);
  return out;
}

function u64(value) {
  const out = Buffer.alloc(8);
  out.writeBigUInt64LE(value, 0);
  return out;
}

function ata(owner, mint) {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

const authority = keypair(WALLET_PATH);
const connection = new Connection(RPC_URL, "confirmed");
const matchPda = PublicKey.findProgramAddressSync(
  [Buffer.from("match"), Buffer.from(MATCH_ID)],
  ORACLE_PROGRAM_ID,
)[0];
const poolPda = PublicKey.findProgramAddressSync(
  [Buffer.from("pool"), Buffer.from(MATCH_ID)],
  BETTING_PROGRAM_ID,
)[0];
const vaultAuthority = PublicKey.findProgramAddressSync(
  [Buffer.from("vault"), Buffer.from(MATCH_ID)],
  BETTING_PROGRAM_ID,
)[0];
const vault = ata(vaultAuthority, MINT);
const lpPosition = PublicKey.findProgramAddressSync(
  [Buffer.from("lp"), poolPda.toBuffer(), authority.publicKey.toBuffer()],
  BETTING_PROGRAM_ID,
)[0];
const ownerTokenAccount = ata(authority.publicKey, MINT);

const updateOddsIx = new TransactionInstruction({
  programId: ORACLE_PROGRAM_ID,
  keys: [
    { pubkey: authority.publicKey, isSigner: true, isWritable: true },
    { pubkey: matchPda, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ],
  data: Buffer.concat([
    discriminator("update_odds"),
    stringBytes(MATCH_ID),
    u16(4500),
    u16(3500),
    u16(2000),
    stringBytes(TAG),
  ]),
});

const createPoolIx = new TransactionInstruction({
  programId: BETTING_PROGRAM_ID,
  keys: [
    { pubkey: authority.publicKey, isSigner: true, isWritable: true },
    { pubkey: poolPda, isSigner: false, isWritable: true },
    { pubkey: MINT, isSigner: false, isWritable: false },
    { pubkey: vaultAuthority, isSigner: false, isWritable: false },
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ],
  data: Buffer.concat([
    discriminator("create_pool"),
    stringBytes(MATCH_ID),
    u16(FEE_RATE_BPS),
  ]),
});

const depositIx = new TransactionInstruction({
  programId: BETTING_PROGRAM_ID,
  keys: [
    { pubkey: authority.publicKey, isSigner: true, isWritable: true },
    { pubkey: poolPda, isSigner: false, isWritable: true },
    { pubkey: lpPosition, isSigner: false, isWritable: true },
    { pubkey: MINT, isSigner: false, isWritable: false },
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: ownerTokenAccount, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ],
  data: Buffer.concat([discriminator("deposit"), u64(DEPOSIT_AMOUNT)]),
});

const signature = await sendAndConfirmTransaction(
  connection,
  new Transaction().add(updateOddsIx, createPoolIx, depositIx),
  [authority],
);

console.log({
  signature,
  matchId: MATCH_ID,
  matchPda: matchPda.toBase58(),
  poolPda: poolPda.toBase58(),
  vault: vault.toBase58(),
  lpPosition: lpPosition.toBase58(),
});
NODE
cd ..
```

## 11. Run Smoke Tests

```bash
cargo test
cd app && npm test && npm run build
cd ../backend && npm test
cd ..
```

## 12. Start Services

Terminal 3:

```bash
cd /Users/olivmath/Documents/dev/solana-hacka-fut/backend
npm run start:local
```

Terminal 4:

```bash
cd /Users/olivmath/Documents/dev/solana-hacka-fut/app
npm run dev:local
```

Open:

```text
http://127.0.0.1:5173
```

## 13. Check Backend Data

With the backend running:

```bash
curl http://127.0.0.1:8787/health
curl -X POST http://127.0.0.1:8787/poller/start
curl http://127.0.0.1:8787/status
curl http://127.0.0.1:8787/matches
```

Expected:

```text
health.ok = true
blockchain.rpcUrl = http://127.0.0.1:8899
blockchain.mint = $TEST_USDC_MINT
recent activity includes update_odds transactions
```

## 14. Test In Browser


| Step | Action                                                         |
| ---- | -------------------------------------------------------------- |
| 1    | Configure Phantom/Solflare custom RPC: `http://127.0.0.1:8899` |
| 2    | Connect User 1 or User 2 wallet                                |
| 3    | Confirm the app shows the new test USDC mint                   |
| 4    | Confirm wallet USDC balance is loaded                          |
| 5    | Start poller if no matches appear                              |
| 6    | Place an `UP` or `DOWN` bet with at least `1` USDC             |


Current code note:

```text
betting_engine expects pool/vault accounts for place_bet.
If the browser bet flow still sends escrow accounts, the pool setup above is valid but the frontend bet transaction must be updated before browser betting works.
```

## One-Shot Command Block

Use after `solana-test-validator --reset` is already running:

```bash
cd /Users/olivmath/Documents/dev/solana-hacka-fut
solana config set --url http://127.0.0.1:8899

solana airdrop 20 CvReCDqGVKDU9i1ZF8WZy1NUbdZrZVs423FPFiNB3kyj
solana airdrop 10 4jA7EqUwJunWw8HACbgSDxGWDZRwR6naRRkrdj2mpYfn
solana airdrop 10 dj3MrNNHGSGYqnw32cCDJveEStHnrHDnYM12oVEB4Jv

anchor keys sync
anchor build
anchor deploy

export TEST_USDC_MINT="$(spl-token create-token --decimals 6 | awk '/Creating token/ {print $3}')"
echo "TEST_USDC_MINT=$TEST_USDC_MINT"

spl-token create-account "$TEST_USDC_MINT" --owner CvReCDqGVKDU9i1ZF8WZy1NUbdZrZVs423FPFiNB3kyj
spl-token create-account "$TEST_USDC_MINT" --owner 4jA7EqUwJunWw8HACbgSDxGWDZRwR6naRRkrdj2mpYfn
spl-token create-account "$TEST_USDC_MINT" --owner dj3MrNNHGSGYqnw32cCDJveEStHnrHDnYM12oVEB4Jv

spl-token mint "$TEST_USDC_MINT" 100000 --recipient-owner CvReCDqGVKDU9i1ZF8WZy1NUbdZrZVs423FPFiNB3kyj
spl-token mint "$TEST_USDC_MINT" 1000 --recipient-owner 4jA7EqUwJunWw8HACbgSDxGWDZRwR6naRRkrdj2mpYfn
spl-token mint "$TEST_USDC_MINT" 1000 --recipient-owner dj3MrNNHGSGYqnw32cCDJveEStHnrHDnYM12oVEB4Jv

cat > backend/.env.local <<EOF
PORT=8787
SOLANA_RPC_URL=http://127.0.0.1:8899
ORACLE_KEYPAIR=~/.config/solana/id.json
ORACLE_PROGRAM_ID=BfWcrr3Mv4StpqSyaMUZtsLLUTM9cLkNeaARRdwSFSCN
BETTING_PROGRAM_ID=FBXnZZHR3ndsE2oYak4EQaFTPZsEC7d34C8tQfE7hkm4
TEST_USDC_MINT=$TEST_USDC_MINT
ODDS_SOURCE=generated
ODDS_POLL_INTERVAL_MS=60000
EOF

cat > app/.env.local <<EOF
VITE_SOLANA_RPC_URL=http://127.0.0.1:8899
VITE_BACKEND_URL=http://127.0.0.1:8787
VITE_ORACLE_PROGRAM_ID=BfWcrr3Mv4StpqSyaMUZtsLLUTM9cLkNeaARRdwSFSCN
VITE_BETTING_PROGRAM_ID=FBXnZZHR3ndsE2oYak4EQaFTPZsEC7d34C8tQfE7hkm4
VITE_TEST_USDC_MINT=$TEST_USDC_MINT
EOF

spl-token accounts --owner CvReCDqGVKDU9i1ZF8WZy1NUbdZrZVs423FPFiNB3kyj
spl-token accounts --owner 4jA7EqUwJunWw8HACbgSDxGWDZRwR6naRRkrdj2mpYfn
spl-token accounts --owner dj3MrNNHGSGYqnw32cCDJveEStHnrHDnYM12oVEB4Jv
```

