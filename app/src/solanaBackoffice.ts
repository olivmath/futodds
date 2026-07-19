import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { Buffer } from "buffer";

export const DEFAULT_ORACLE_PROGRAM_ID = new PublicKey("6BVWCCQDjQDcjQYhmbzJ9DFWY9LyDojM3mYoWivrASaG");
export const DEFAULT_BETTING_PROGRAM_ID = new PublicKey("GoccKzkMS5BWRmrbLdGKzqKUUcksZB3DftW82F7boCoQ");
export const ORACLE_PROGRAM_ID = new PublicKey(import.meta.env.VITE_ORACLE_PROGRAM_ID ?? DEFAULT_ORACLE_PROGRAM_ID);
export const BETTING_PROGRAM_ID = new PublicKey(import.meta.env.VITE_BETTING_PROGRAM_ID ?? DEFAULT_BETTING_PROGRAM_ID);
export const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
export const TEST_USDC_MINT = new PublicKey("CDAQWBQ3DciCWQDtyczAWvTp3xuyuL2t273LSdffjxB");
export const TESTNET_RPC_URL = "https://api.testnet.solana.com";
export const DEFAULT_BACKEND_URL = "http://localhost:8787";
export const MATCH_ACCOUNT_SIZE = 165;
export const BET_ACCOUNT_SIZE = 157;

const UPDATE_ODDS_DISCRIMINATOR = Uint8Array.from([185, 97, 196, 202, 171, 32, 3, 160]);
const PLACE_BET_DISCRIMINATOR = Uint8Array.from([222, 62, 67, 220, 63, 166, 126, 33]);
const SETTLE_BET_DISCRIMINATOR = Uint8Array.from([115, 55, 234, 177, 227, 4, 10, 67]);
const CREATE_POOL_DISCRIMINATOR = Uint8Array.from([233, 146, 209, 142, 207, 104, 64, 188]);
const DEPOSIT_DISCRIMINATOR = Uint8Array.from([242, 35, 198, 137, 82, 225, 242, 182]);
const ODDS_UPDATED_EVENT_DISCRIMINATOR = Uint8Array.from([156, 39, 18, 117, 46, 12, 46, 218]);
const BET_SETTLED_EVENT_DISCRIMINATOR = Uint8Array.from([57, 145, 224, 160, 62, 119, 227, 206]);

export type OddsInput = {
  home: number;
  away: number;
  draw: number;
};

export type Direction = 0 | 1;

export type MatchAccount = {
  authority: PublicKey;
  matchId: string;
  tag: string;
  oddsHome: number;
  oddsAway: number;
  oddsDraw: number;
  updatedAt: bigint;
  status: number;
  oddsSource: number;
  bump: number;
};

export type BetAccount = {
  user: PublicKey;
  authority: PublicKey;
  matchId: string;
  direction: Direction;
  oddsAtEntry: number;
  amount: bigint;
  payout: bigint;
  windowSecs: number;
  createdAt: bigint;
  expiresAt: bigint;
  status: number;
  nonce: number;
  bump: number;
};

export type BetInput = {
  direction: Direction;
  windowSecs: number;
  amount: bigint;
  nonce: number;
};

export type OddsUpdatedEvent = {
  type: "OddsUpdated";
  authority: PublicKey;
  matchId: string;
  tag: string;
  oddsHome: number;
  oddsAway: number;
  oddsDraw: number;
  updatedAt: bigint;
};

export type BetSettledEvent = {
  type: "BetSettled";
  authority: PublicKey;
  user: PublicKey;
  matchId: string;
  bet: PublicKey;
  direction: Direction;
  oddsAtEntry: number;
  oddsAtExpiryHome: number;
  status: number;
  won: boolean;
  settledAt: bigint;
};

export type AnchorBackofficeEvent = OddsUpdatedEvent | BetSettledEvent;

export type BackofficeEnv = {
  VITE_SOLANA_RPC_URL?: string;
  VITE_TEST_USDC_MINT?: string;
  VITE_BACKEND_URL?: string;
  VITE_ORACLE_PROGRAM_ID?: string;
  VITE_BETTING_PROGRAM_ID?: string;
};

export type BackofficeConfig = {
  rpcUrl: string;
  testUsdcMint: PublicKey;
  backendUrl: string;
  oracleProgramId: PublicKey;
  bettingProgramId: PublicKey;
};

export function resolveBackofficeConfig(env: BackofficeEnv = import.meta.env): BackofficeConfig {
  return {
    rpcUrl: env.VITE_SOLANA_RPC_URL ?? TESTNET_RPC_URL,
    testUsdcMint: new PublicKey(env.VITE_TEST_USDC_MINT ?? TEST_USDC_MINT),
    backendUrl: env.VITE_BACKEND_URL ?? DEFAULT_BACKEND_URL,
    oracleProgramId: new PublicKey(env.VITE_ORACLE_PROGRAM_ID ?? DEFAULT_ORACLE_PROGRAM_ID),
    bettingProgramId: new PublicKey(env.VITE_BETTING_PROGRAM_ID ?? DEFAULT_BETTING_PROGRAM_ID),
  };
}

export function oddsSum(odds: OddsInput): number {
  return odds.home + odds.away + odds.draw;
}

export function oddsAreValid(odds: OddsInput): boolean {
  return oddsSum(odds) === 10_000;
}

export function deriveMatchPda(matchId: string): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("match"), Buffer.from(matchId)],
    ORACLE_PROGRAM_ID,
  )[0];
}

export function deriveBetPda(matchId: string, user: PublicKey, nonce: number): PublicKey {
  const nonceBytes = Buffer.alloc(4);
  nonceBytes.writeUInt32LE(nonce);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("bet"), Buffer.from(matchId), user.toBuffer(), nonceBytes],
    BETTING_PROGRAM_ID,
  )[0];
}

export function derivePoolPda(matchId: string): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), Buffer.from(matchId)],
    BETTING_PROGRAM_ID,
  )[0];
}

export function deriveVaultAuthorityPda(matchId: string): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), Buffer.from(matchId)],
    BETTING_PROGRAM_ID,
  )[0];
}

export function deriveLpPositionPda(pool: PublicKey, owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("lp"), pool.toBuffer(), owner.toBuffer()],
    BETTING_PROGRAM_ID,
  )[0];
}

export function deriveAssociatedTokenAddress(owner: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

export function encodeUpdateOddsData(matchId: string, odds: OddsInput, tag = "", oddsSource = 0): Buffer {
  const matchBytes = Buffer.from(matchId, "utf8");
  const tagBytes = Buffer.from(tag, "utf8");
  const data = Buffer.alloc(8 + 4 + matchBytes.length + 6 + 4 + tagBytes.length + 1);
  let offset = 0;
  Buffer.from(UPDATE_ODDS_DISCRIMINATOR).copy(data, offset);
  offset += 8;
  data.writeUInt32LE(matchBytes.length, offset);
  offset += 4;
  matchBytes.copy(data, offset);
  offset += matchBytes.length;
  data.writeUInt16LE(odds.home, offset);
  offset += 2;
  data.writeUInt16LE(odds.away, offset);
  offset += 2;
  data.writeUInt16LE(odds.draw, offset);
  offset += 2;
  data.writeUInt32LE(tagBytes.length, offset);
  offset += 4;
  tagBytes.copy(data, offset);
  offset += tagBytes.length;
  data.writeUInt8(oddsSource, offset);
  return data;
}

export function encodePlaceBetData(input: BetInput): Buffer {
  const data = Buffer.alloc(8 + 1 + 4 + 8 + 4);
  let offset = 0;
  Buffer.from(PLACE_BET_DISCRIMINATOR).copy(data, offset);
  offset += 8;
  data.writeUInt8(input.direction, offset);
  offset += 1;
  data.writeUInt32LE(input.windowSecs, offset);
  offset += 4;
  data.writeBigUInt64LE(input.amount, offset);
  offset += 8;
  data.writeUInt32LE(input.nonce, offset);
  return data;
}

export function encodeSettleBetData(oddsAtExpiryHome: number): Buffer {
  const data = Buffer.alloc(10);
  Buffer.from(SETTLE_BET_DISCRIMINATOR).copy(data, 0);
  data.writeUInt16LE(oddsAtExpiryHome, 8);
  return data;
}

export function encodeCreatePoolData(matchId: string, feeRate: number): Buffer {
  const matchBytes = Buffer.from(matchId, "utf8");
  const data = Buffer.alloc(8 + 4 + matchBytes.length + 2);
  let offset = 0;
  Buffer.from(CREATE_POOL_DISCRIMINATOR).copy(data, offset);
  offset += 8;
  data.writeUInt32LE(matchBytes.length, offset);
  offset += 4;
  matchBytes.copy(data, offset);
  offset += matchBytes.length;
  data.writeUInt16LE(feeRate, offset);
  return data;
}

export function encodeDepositData(amount: bigint): Buffer {
  const data = Buffer.alloc(8 + 8);
  Buffer.from(DEPOSIT_DISCRIMINATOR).copy(data, 0);
  data.writeBigUInt64LE(amount, 8);
  return data;
}

export function encodeMintToData(amount: bigint): Buffer {
  const data = Buffer.alloc(9);
  data.writeUInt8(7, 0);
  data.writeBigUInt64LE(amount, 1);
  return data;
}

export function buildUpdateOddsInstruction(authority: PublicKey, matchId: string, odds: OddsInput): TransactionInstruction {
  return new TransactionInstruction({
    programId: ORACLE_PROGRAM_ID,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: deriveMatchPda(matchId), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: encodeUpdateOddsData(matchId, odds),
  });
}

export function buildCreatePoolInstruction(authority: PublicKey, matchId: string, mint: PublicKey, feeRate: number): TransactionInstruction {
  const vaultAuthority = deriveVaultAuthorityPda(matchId);
  return new TransactionInstruction({
    programId: BETTING_PROGRAM_ID,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: derivePoolPda(matchId), isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: vaultAuthority, isSigner: false, isWritable: false },
      { pubkey: deriveAssociatedTokenAddress(vaultAuthority, mint), isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: encodeCreatePoolData(matchId, feeRate),
  });
}

export function buildDepositInstruction(owner: PublicKey, matchId: string, mint: PublicKey, amount: bigint): TransactionInstruction {
  const poolPda = derivePoolPda(matchId);
  const vaultAuthority = deriveVaultAuthorityPda(matchId);
  return new TransactionInstruction({
    programId: BETTING_PROGRAM_ID,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: poolPda, isSigner: false, isWritable: true },
      { pubkey: deriveLpPositionPda(poolPda, owner), isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: deriveAssociatedTokenAddress(vaultAuthority, mint), isSigner: false, isWritable: true },
      { pubkey: deriveAssociatedTokenAddress(owner, mint), isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: encodeDepositData(amount),
  });
}

export function buildPlaceBetInstruction(user: PublicKey, matchId: string, mint: PublicKey, input: BetInput): TransactionInstruction {
  const vaultAuthority = deriveVaultAuthorityPda(matchId);
  return new TransactionInstruction({
    programId: BETTING_PROGRAM_ID,
    keys: [
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: deriveBetPda(matchId, user, input.nonce), isSigner: false, isWritable: true },
      { pubkey: deriveMatchPda(matchId), isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: derivePoolPda(matchId), isSigner: false, isWritable: true },
      { pubkey: vaultAuthority, isSigner: false, isWritable: false },
      { pubkey: deriveAssociatedTokenAddress(vaultAuthority, mint), isSigner: false, isWritable: true },
      { pubkey: deriveAssociatedTokenAddress(user, mint), isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: encodePlaceBetData(input),
  });
}

export function buildSettleBetInstruction(
  authority: PublicKey,
  user: PublicKey,
  matchId: string,
  mint: PublicKey,
  nonce: number,
  oddsAtExpiryHome: number,
): TransactionInstruction {
  const vaultAuthority = deriveVaultAuthorityPda(matchId);
  return new TransactionInstruction({
    programId: BETTING_PROGRAM_ID,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: deriveBetPda(matchId, user, nonce), isSigner: false, isWritable: true },
      { pubkey: vaultAuthority, isSigner: false, isWritable: false },
      { pubkey: deriveAssociatedTokenAddress(vaultAuthority, mint), isSigner: false, isWritable: true },
      { pubkey: deriveAssociatedTokenAddress(user, mint), isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: encodeSettleBetData(oddsAtExpiryHome),
  });
}

export function buildCreateAssociatedTokenAccountInstruction(payer: PublicKey, owner: PublicKey, mint: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: deriveAssociatedTokenAddress(owner, mint), isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.alloc(0),
  });
}

export function buildMintToInstruction(mint: PublicKey, destination: PublicKey, authority: PublicKey, amount: bigint): TransactionInstruction {
  return new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
    ],
    data: encodeMintToData(amount),
  });
}

export function buildMatchAccountFilters() {
  return [{ dataSize: MATCH_ACCOUNT_SIZE }];
}

export function buildUserBetFilters(user: PublicKey) {
  return [
    { dataSize: BET_ACCOUNT_SIZE },
    { memcmp: { offset: 8, bytes: user.toBase58() } },
  ];
}

export function decodeMatchAccount(data: Buffer | Uint8Array): MatchAccount {
  const buffer = Buffer.from(data);
  let offset = 8;
  const authority = new PublicKey(buffer.subarray(offset, offset + 32));
  offset += 32;
  const matchIdLength = buffer.readUInt32LE(offset);
  offset += 4;
  const matchId = buffer.subarray(offset, offset + matchIdLength).toString("utf8");
  offset += matchIdLength;
  const tagLength = buffer.readUInt32LE(offset);
  offset += 4;
  const tag = buffer.subarray(offset, offset + tagLength).toString("utf8");
  offset += tagLength;
  const oddsHome = buffer.readUInt16LE(offset);
  offset += 2;
  const oddsAway = buffer.readUInt16LE(offset);
  offset += 2;
  const oddsDraw = buffer.readUInt16LE(offset);
  offset += 2;
  const updatedAt = buffer.readBigInt64LE(offset);
  offset += 8;
  const status = buffer.readUInt8(offset);
  offset += 1;
  const oddsSource = buffer.readUInt8(offset);
  offset += 1;
  const bump = buffer.readUInt8(offset);
  return { authority, matchId, tag, oddsHome, oddsAway, oddsDraw, updatedAt, status, oddsSource, bump };
}

export function decodeBetAccount(data: Buffer | Uint8Array): BetAccount {
  const buffer = Buffer.from(data);
  let offset = 8;
  const user = new PublicKey(buffer.subarray(offset, offset + 32));
  offset += 32;
  const authority = new PublicKey(buffer.subarray(offset, offset + 32));
  offset += 32;
  const matchIdLength = buffer.readUInt32LE(offset);
  offset += 4;
  const matchId = buffer.subarray(offset, offset + matchIdLength).toString("utf8");
  offset += matchIdLength;
  const direction = buffer.readUInt8(offset) as Direction;
  offset += 1;
  const oddsAtEntry = buffer.readUInt16LE(offset);
  offset += 2;
  const amount = buffer.readBigUInt64LE(offset);
  offset += 8;
  const payout = buffer.readBigUInt64LE(offset);
  offset += 8;
  const windowSecs = buffer.readUInt32LE(offset);
  offset += 4;
  const createdAt = buffer.readBigInt64LE(offset);
  offset += 8;
  const expiresAt = buffer.readBigInt64LE(offset);
  offset += 8;
  const status = buffer.readUInt8(offset);
  offset += 1;
  const nonce = buffer.readUInt32LE(offset);
  offset += 4;
  const bump = buffer.readUInt8(offset);
  return { user, authority, matchId, direction, oddsAtEntry, amount, payout, windowSecs, createdAt, expiresAt, status, nonce, bump };
}

export function decodeTokenAccountAmount(data: Buffer | Uint8Array): bigint {
  return Buffer.from(data).readBigUInt64LE(64);
}

export function parseAnchorEventFromLogs(logs: string[]): AnchorBackofficeEvent | null {
  for (const log of logs) {
    if (!log.startsWith("Program data: ")) {
      continue;
    }

    const payload = Buffer.from(log.slice("Program data: ".length), "base64");
    try {
      if (startsWith(payload, ODDS_UPDATED_EVENT_DISCRIMINATOR)) {
        return decodeOddsUpdatedEvent(payload);
      }
      if (startsWith(payload, BET_SETTLED_EVENT_DISCRIMINATOR)) {
        return decodeBetSettledEvent(payload);
      }
    } catch {
      return null;
    }
  }

  return null;
}

function decodeOddsUpdatedEvent(payload: Buffer): OddsUpdatedEvent {
  let offset = 8;
  const authority = new PublicKey(payload.subarray(offset, offset + 32));
  offset += 32;
  const matchId = readString(payload, offset);
  offset = matchId.nextOffset;
  const tag = readString(payload, offset);
  offset = tag.nextOffset;
  const oddsHome = payload.readUInt16LE(offset);
  offset += 2;
  const oddsAway = payload.readUInt16LE(offset);
  offset += 2;
  const oddsDraw = payload.readUInt16LE(offset);
  offset += 2;
  const updatedAt = payload.readBigInt64LE(offset);
  return { type: "OddsUpdated", authority, matchId: matchId.value, tag: tag.value, oddsHome, oddsAway, oddsDraw, updatedAt };
}

function decodeBetSettledEvent(payload: Buffer): BetSettledEvent {
  let offset = 8;
  const authority = new PublicKey(payload.subarray(offset, offset + 32));
  offset += 32;
  const user = new PublicKey(payload.subarray(offset, offset + 32));
  offset += 32;
  const matchId = readString(payload, offset);
  offset = matchId.nextOffset;
  const bet = new PublicKey(payload.subarray(offset, offset + 32));
  offset += 32;
  const direction = payload.readUInt8(offset) as Direction;
  offset += 1;
  const oddsAtEntry = payload.readUInt16LE(offset);
  offset += 2;
  const oddsAtExpiryHome = payload.readUInt16LE(offset);
  offset += 2;
  const status = payload.readUInt8(offset);
  offset += 1;
  const won = payload.readUInt8(offset) === 1;
  offset += 1;
  const settledAt = payload.readBigInt64LE(offset);
  return { type: "BetSettled", authority, user, matchId: matchId.value, bet, direction, oddsAtEntry, oddsAtExpiryHome, status, won, settledAt };
}

function readString(buffer: Buffer, offset: number): { value: string; nextOffset: number } {
  const length = buffer.readUInt32LE(offset);
  const start = offset + 4;
  return {
    value: buffer.subarray(start, start + length).toString("utf8"),
    nextOffset: start + length,
  };
}

function startsWith(buffer: Buffer, prefix: Uint8Array): boolean {
  return prefix.every((byte, index) => buffer[index] === byte);
}
