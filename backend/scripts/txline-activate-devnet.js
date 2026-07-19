import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import nacl from "tweetnacl";

const TXLINE_PROGRAM_ID = new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");
const TXLINE_TOKEN_MINT = new PublicKey("4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG");
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const SUBSCRIBE_DISCRIMINATOR = Uint8Array.from([254, 28, 191, 138, 156, 179, 183, 53]);

const rpcUrl = process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com";
const apiOrigin = process.env.TXLINE_API_ORIGIN ?? "https://txline-dev.txodds.com";
const walletPath = expandHome(process.env.ANCHOR_WALLET ?? "~/.config/solana/id.json");
const serviceLevelId = Number(process.env.TXLINE_SERVICE_LEVEL_ID ?? 1);
const durationWeeks = Number(process.env.TXLINE_DURATION_WEEKS ?? 4);
const selectedLeagues = parseSelectedLeagues(process.env.TXLINE_SELECTED_LEAGUES ?? "");

const connection = new Connection(rpcUrl, "confirmed");
const wallet = loadKeypair(walletPath);

const tokenTreasuryPda = PublicKey.findProgramAddressSync(
  [Buffer.from("token_treasury_v2")],
  TXLINE_PROGRAM_ID,
)[0];
const tokenTreasuryVault = deriveAssociatedTokenAddress(TXLINE_TOKEN_MINT, tokenTreasuryPda, true);
const pricingMatrixPda = PublicKey.findProgramAddressSync(
  [Buffer.from("pricing_matrix")],
  TXLINE_PROGRAM_ID,
)[0];
const userTokenAccount = deriveAssociatedTokenAddress(TXLINE_TOKEN_MINT, wallet.publicKey, false);

const txSig = process.env.TXLINE_SUBSCRIBE_TX ?? await subscribe();
const jwt = await startGuestSession();
const apiToken = await activateToken(txSig, jwt);

console.log("");
console.log("TxLINE Devnet credentials activated.");
console.log("");
console.log(`TXLINE_API_ORIGIN=${apiOrigin}`);
console.log(`TXLINE_GUEST_JWT=${jwt}`);
console.log(`TXLINE_API_TOKEN=${apiToken}`);
console.log(`TXLINE_SUBSCRIBE_TX=${txSig}`);

async function subscribe() {
  const transaction = new Transaction();
  if (!(await connection.getAccountInfo(userTokenAccount))) {
    transaction.add(buildCreateAssociatedTokenAccountInstruction({
      payer: wallet.publicKey,
      associatedToken: userTokenAccount,
      owner: wallet.publicKey,
      mint: TXLINE_TOKEN_MINT,
    }));
  }

  const data = Buffer.alloc(11);
  Buffer.from(SUBSCRIBE_DISCRIMINATOR).copy(data, 0);
  data.writeUInt16LE(serviceLevelId, 8);
  data.writeUInt8(durationWeeks, 10);

  transaction.add(new TransactionInstruction({
    programId: TXLINE_PROGRAM_ID,
    keys: [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: pricingMatrixPda, isSigner: false, isWritable: false },
      { pubkey: TXLINE_TOKEN_MINT, isSigner: false, isWritable: false },
      { pubkey: userTokenAccount, isSigner: false, isWritable: true },
      { pubkey: tokenTreasuryVault, isSigner: false, isWritable: true },
      { pubkey: tokenTreasuryPda, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  }));

  return sendAndConfirmTransaction(
    connection,
    transaction,
    [wallet],
    { commitment: "confirmed" },
  );
}

function buildCreateAssociatedTokenAccountInstruction({ payer, associatedToken, owner, mint }) {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedToken, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.alloc(0),
  });
}

async function startGuestSession() {
  const response = await fetch(`${apiOrigin}/auth/guest/start`, { method: "POST" });
  if (!response.ok) {
    throw new Error(`Failed to start guest session: ${response.status} ${await response.text()}`);
  }
  const body = await response.json();
  if (!body.token) {
    throw new Error("Guest session response did not include token");
  }
  return body.token;
}

async function activateToken(txSig, jwt) {
  const message = `${txSig}:${selectedLeagues.join(",")}:${jwt}`;
  const walletSignature = Buffer.from(
    nacl.sign.detached(new TextEncoder().encode(message), wallet.secretKey),
  ).toString("base64");

  const response = await fetch(`${apiOrigin}/api/token/activate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ txSig, walletSignature, leagues: selectedLeagues }),
  });
  if (!response.ok) {
    throw new Error(`Failed to activate token: ${response.status} ${await response.text()}`);
  }
  const text = await response.text();
  try {
    const body = JSON.parse(text);
    return body.token ?? body;
  } catch {
    return text;
  }
}

function deriveAssociatedTokenAddress(mint, owner) {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_2022_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

function parseSelectedLeagues(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => Number(item));
}

function loadKeypair(filePath) {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(filePath, "utf8"))));
}

function expandHome(filePath) {
  return filePath.startsWith("~/") ? path.join(os.homedir(), filePath.slice(2)) : filePath;
}
