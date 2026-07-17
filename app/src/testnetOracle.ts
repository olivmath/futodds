import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  "6BVWCCQDjQDcjQYhmbzJ9DFWY9LyDojM3mYoWivrASaG",
);

export const TESTNET_RPC_URL = "https://api.testnet.solana.com";

export const BETTING_ENGINE_PROGRAM_ID = new PublicKey(
  "GoccKzkMS5BWRmrbLdGKzqKUUcksZB3DftW82F7boCoQ",
);

export const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);

export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);

export const TEST_USDC_MINT = new PublicKey(
  "CDAQWBQ3DciCWQDtyczAWvTp3xuyuL2t273LSdffjxB",
);

export const MATCH_ACCOUNT_SIZE = 95;
export const BET_ACCOUNT_SIZE = 157;

export const UPDATE_ODDS_DISCRIMINATOR = Uint8Array.from([
  185, 97, 196, 202, 171, 32, 3, 160,
]);

export const PLACE_BET_DISCRIMINATOR = Uint8Array.from([
  222, 62, 67, 220, 63, 166, 126, 33,
]);

export const SETTLE_BET_DISCRIMINATOR = Uint8Array.from([
  115, 55, 234, 177, 227, 4, 10, 67,
]);

export type OddsInput = {
  home: number;
  away: number;
  draw: number;
};

export type MatchAccount = {
  authority: PublicKey;
  matchId: string;
  oddsHome: number;
  oddsAway: number;
  oddsDraw: number;
  updatedAt: bigint;
  bump: number;
};

export type Direction = 0 | 1;

export type BetInput = {
  direction: Direction;
  windowSecs: number;
  amount: bigint;
  nonce: number;
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

export function encodeMintToData(amount: bigint): Buffer {
  const data = Buffer.alloc(1 + 8);
  data.writeUInt8(7, 0);
  data.writeBigUInt64LE(amount, 1);
  return data;
}

export function resolveWalletPublicKey(
  connectPublicKey?: PublicKey,
  providerPublicKey?: PublicKey,
): PublicKey {
  const publicKey = connectPublicKey ?? providerPublicKey;
  if (!publicKey) {
    throw new Error("A carteira conectou, mas nao informou a chave publica.");
  }

  return publicKey;
}

export function oddsSum({ home, away, draw }: OddsInput): number {
  return home + away + draw;
}

export function oddsAreValid(odds: OddsInput): boolean {
  return oddsSum(odds) === 10_000;
}

export function deriveMatchPda(matchId: string): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("match"), Buffer.from(matchId)],
    PROGRAM_ID,
  )[0];
}

export function deriveBetPda(matchId: string, user: PublicKey, nonce: number): PublicKey {
  const nonceBytes = Buffer.alloc(4);
  nonceBytes.writeUInt32LE(nonce);

  return PublicKey.findProgramAddressSync(
    [Buffer.from("bet"), Buffer.from(matchId), user.toBuffer(), nonceBytes],
    BETTING_ENGINE_PROGRAM_ID,
  )[0];
}

export function deriveVaultAuthorityPda(matchId: string): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), Buffer.from(matchId)],
    BETTING_ENGINE_PROGRAM_ID,
  )[0];
}

export function deriveAssociatedTokenAddress(owner: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

export function usdcToUnits(value: string): bigint {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{0,6})?$/.test(trimmed)) {
    throw new Error("Use ate 6 casas decimais.");
  }

  const [whole, fraction = ""] = trimmed.split(".");
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
}

export function encodeUpdateOddsData(matchId: string, odds: OddsInput): Buffer {
  const matchBytes = Buffer.from(matchId, "utf8");
  const data = Buffer.alloc(8 + 4 + matchBytes.length + 2 + 2 + 2);
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
  const data = Buffer.alloc(8 + 2);
  Buffer.from(SETTLE_BET_DISCRIMINATOR).copy(data, 0);
  data.writeUInt16LE(oddsAtExpiryHome, 8);
  return data;
}

export function buildUpdateOddsInstruction(
  authority: PublicKey,
  matchId: string,
  odds: OddsInput,
): TransactionInstruction {
  const matchAccount = deriveMatchPda(matchId);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: matchAccount, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: encodeUpdateOddsData(matchId, odds),
  });
}

export function buildPlaceBetInstruction(
  user: PublicKey,
  matchId: string,
  mint: PublicKey,
  input: BetInput,
): TransactionInstruction {
  const bet = deriveBetPda(matchId, user, input.nonce);
  const matchAccount = deriveMatchPda(matchId);
  const vaultAuthority = deriveVaultAuthorityPda(matchId);
  const vault = deriveAssociatedTokenAddress(vaultAuthority, mint);
  const userTokenAccount = deriveAssociatedTokenAddress(user, mint);

  return new TransactionInstruction({
    programId: BETTING_ENGINE_PROGRAM_ID,
    keys: [
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: bet, isSigner: false, isWritable: true },
      { pubkey: matchAccount, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: vaultAuthority, isSigner: false, isWritable: false },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: userTokenAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
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
  const bet = deriveBetPda(matchId, user, nonce);
  const vaultAuthority = deriveVaultAuthorityPda(matchId);
  const vault = deriveAssociatedTokenAddress(vaultAuthority, mint);
  const userTokenAccount = deriveAssociatedTokenAddress(user, mint);

  return new TransactionInstruction({
    programId: BETTING_ENGINE_PROGRAM_ID,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: bet, isSigner: false, isWritable: true },
      { pubkey: vaultAuthority, isSigner: false, isWritable: false },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: userTokenAccount, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: encodeSettleBetData(oddsAtExpiryHome),
  });
}

export function buildCreateAssociatedTokenAccountInstruction(
  payer: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
): TransactionInstruction {
  const associatedTokenAccount = deriveAssociatedTokenAddress(owner, mint);

  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedTokenAccount, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.alloc(0),
  });
}

export function buildUserBetFilters(user: PublicKey) {
  return [
    { dataSize: BET_ACCOUNT_SIZE },
    { memcmp: { offset: 8, bytes: user.toBase58() } },
  ];
}

export function buildMatchAccountFilters() {
  return [{ dataSize: MATCH_ACCOUNT_SIZE }];
}

export function formatTokenUnits(amount: bigint): string {
  const whole = amount / 1_000_000n;
  const fraction = amount % 1_000_000n;
  if (fraction === 0n) {
    return whole.toString();
  }

  return `${whole}.${fraction.toString().padStart(6, "0").replace(/0+$/, "")}`;
}

export function buildMintToInstruction(
  mint: PublicKey,
  destination: PublicKey,
  authority: PublicKey,
  amount: bigint,
): TransactionInstruction {
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

export function decodeMatchAccount(data: Buffer | Uint8Array): MatchAccount {
  const buffer = Buffer.from(data);
  let offset = 8;

  const authority = new PublicKey(buffer.subarray(offset, offset + 32));
  offset += 32;

  const matchIdLength = buffer.readUInt32LE(offset);
  offset += 4;

  const matchId = buffer.subarray(offset, offset + matchIdLength).toString("utf8");
  offset += matchIdLength;

  const oddsHome = buffer.readUInt16LE(offset);
  offset += 2;
  const oddsAway = buffer.readUInt16LE(offset);
  offset += 2;
  const oddsDraw = buffer.readUInt16LE(offset);
  offset += 2;
  const updatedAt = buffer.readBigInt64LE(offset);
  offset += 8;
  const bump = buffer.readUInt8(offset);

  return {
    authority,
    matchId,
    oddsHome,
    oddsAway,
    oddsDraw,
    updatedAt,
    bump,
  };
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

  return {
    user,
    authority,
    matchId,
    direction,
    oddsAtEntry,
    amount,
    payout,
    windowSecs,
    createdAt,
    expiresAt,
    status,
    nonce,
    bump,
  };
}
