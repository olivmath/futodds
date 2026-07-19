/**
 * Client-side Solana layer for the investor panel: wallet connection
 * (Phantom/Solflare) and raw instruction builders for the betting-engine
 * program's LP flows (deposit / withdraw / claim_fees).
 *
 * Account orders and discriminators mirror programs/betting-engine/src/lib.rs.
 */

import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { Buffer } from "buffer";

export const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);

const DEPOSIT_DISCRIMINATOR = Uint8Array.from([242, 35, 198, 137, 82, 225, 242, 182]);
const WITHDRAW_DISCRIMINATOR = Uint8Array.from([183, 18, 70, 156, 148, 109, 161, 34]);
const CLAIM_FEES_DISCRIMINATOR = Uint8Array.from([82, 251, 233, 156, 12, 52, 184, 202]);

export type BrowserWallet = {
  publicKey?: PublicKey;
  connect: () => Promise<{ publicKey?: PublicKey } | void>;
  signTransaction?: (transaction: Transaction) => Promise<Transaction>;
  signAndSendTransaction?: (transaction: Transaction) => Promise<{ signature: string }>;
};

declare global {
  interface Window {
    solana?: BrowserWallet;
    solflare?: BrowserWallet;
  }
}

export type ConnectedWallet = {
  provider: BrowserWallet;
  publicKey: PublicKey;
};

export async function connectWallet(): Promise<ConnectedWallet> {
  const provider = window.solana ?? window.solflare;
  if (!provider) {
    throw new Error("No Solana wallet found — install Phantom or Solflare.");
  }
  const result = await provider.connect();
  const publicKey = result?.publicKey ?? provider.publicKey;
  if (!publicKey) {
    throw new Error("Wallet did not return a public key.");
  }
  return { provider, publicKey: new PublicKey(publicKey.toString()) };
}

export function deriveVaultAuthorityPda(matchId: string, programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), Buffer.from(matchId)],
    programId,
  )[0];
}

export function deriveLpPositionPda(
  pool: PublicKey,
  owner: PublicKey,
  programId: PublicKey,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("lp"), pool.toBuffer(), owner.toBuffer()],
    programId,
  )[0];
}

export function deriveAssociatedTokenAddress(owner: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

type PoolAccounts = {
  programId: PublicKey;
  owner: PublicKey;
  pool: PublicKey;
  matchId: string;
  mint: PublicKey;
  vault: PublicKey;
};

function encodeU64(discriminator: Uint8Array, value: bigint): Buffer {
  const data = Buffer.alloc(16);
  Buffer.from(discriminator).copy(data, 0);
  data.writeBigUInt64LE(value, 8);
  return data;
}

export function buildDepositInstruction(
  { programId, owner, pool, mint, vault }: PoolAccounts,
  amount: bigint,
): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: deriveLpPositionPda(pool, owner, programId), isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: deriveAssociatedTokenAddress(owner, mint), isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: encodeU64(DEPOSIT_DISCRIMINATOR, amount),
  });
}

function lpFlowKeys({ programId, owner, pool, matchId, mint, vault }: PoolAccounts) {
  return [
    { pubkey: owner, isSigner: true, isWritable: true },
    { pubkey: pool, isSigner: false, isWritable: true },
    { pubkey: deriveLpPositionPda(pool, owner, programId), isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: deriveVaultAuthorityPda(matchId, programId), isSigner: false, isWritable: false },
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: deriveAssociatedTokenAddress(owner, mint), isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];
}

export function buildWithdrawInstruction(
  accounts: PoolAccounts,
  shares: bigint,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: accounts.programId,
    keys: lpFlowKeys(accounts),
    data: encodeU64(WITHDRAW_DISCRIMINATOR, shares),
  });
}

export function buildClaimFeesInstruction(accounts: PoolAccounts): TransactionInstruction {
  return new TransactionInstruction({
    programId: accounts.programId,
    keys: lpFlowKeys(accounts),
    data: Buffer.from(CLAIM_FEES_DISCRIMINATOR),
  });
}

/**
 * Sends a transaction through the wallet, waits for confirmation and returns
 * the signature. `onSignature` fires as soon as the tx is in flight.
 */
export async function sendInstructions(
  connection: Connection,
  wallet: ConnectedWallet,
  instructions: TransactionInstruction[],
  onSignature?: (signature: string) => void,
): Promise<string> {
  const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: wallet.publicKey,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  });
  transaction.add(...instructions);

  let signature: string;
  if (wallet.provider.signTransaction) {
    const signed = await wallet.provider.signTransaction(transaction);
    signature = await connection.sendRawTransaction(signed.serialize());
  } else if (wallet.provider.signAndSendTransaction) {
    signature = (await wallet.provider.signAndSendTransaction(transaction)).signature;
  } else {
    throw new Error("Wallet cannot sign transactions.");
  }

  onSignature?.(signature);
  await connection.confirmTransaction({ signature, ...latestBlockhash }, "confirmed");
  return signature;
}

/** USDC balance of the owner's associated token account, in base units. */
export async function fetchTokenBalance(
  connection: Connection,
  owner: PublicKey,
  mint: PublicKey,
): Promise<bigint> {
  try {
    const ata = deriveAssociatedTokenAddress(owner, mint);
    const balance = await connection.getTokenAccountBalance(ata, "confirmed");
    return BigInt(balance.value.amount);
  } catch {
    return 0n; // ATA does not exist yet
  }
}

export function shortenAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}
