import {
  Connection,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";

export const ORACLE_PROGRAM_ID = new PublicKey(
  process.env.ORACLE_PROGRAM_ID ?? "HwDVX9fTTxmnLBJwtig7ugsWuiqLh14pj71WtxQaaSSa",
);
export const BETTING_PROGRAM_ID = new PublicKey(
  process.env.BETTING_PROGRAM_ID ?? "67mbZdR3KxZxRxgKDMT7JbxtYU92C1y81Q4KKGQRkMMY",
);
export const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
export const MATCH_ACCOUNT_SIZE = 164;
export const BET_ACCOUNT_SIZE = 157;

const UPDATE_ODDS_DISCRIMINATOR = Uint8Array.from([185, 97, 196, 202, 171, 32, 3, 160]);
const SETTLE_BET_DISCRIMINATOR = Uint8Array.from([115, 55, 234, 177, 227, 4, 10, 67]);
const SET_MATCH_STATUS_DISCRIMINATOR = Uint8Array.from([251, 129, 173, 156, 248, 131, 170, 50]);
const POOL_ACCOUNT_DISCRIMINATOR = Uint8Array.from([241, 154, 109, 4, 17, 177, 109, 188]);
const LP_POSITION_ACCOUNT_DISCRIMINATOR = Uint8Array.from([105, 241, 37, 200, 224, 2, 252, 90]);

// Mirrors betting_engine::FEE_SCALE — fees_per_share is scaled by 1e12.
export const FEE_SCALE = 1_000_000_000_000n;

export function createConnection(rpcUrl) {
  return new Connection(rpcUrl, "confirmed");
}

export function deriveMatchPda(matchId) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("match"), Buffer.from(matchId)],
    ORACLE_PROGRAM_ID,
  )[0];
}

export function deriveBetPda(matchId, user, nonce) {
  const nonceBytes = Buffer.alloc(4);
  nonceBytes.writeUInt32LE(nonce);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("bet"), Buffer.from(matchId), new PublicKey(user).toBuffer(), nonceBytes],
    BETTING_PROGRAM_ID,
  )[0];
}

export function derivePoolPda(matchId) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), Buffer.from(matchId)],
    BETTING_PROGRAM_ID,
  )[0];
}

export function deriveVaultAuthorityPda(matchId) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), Buffer.from(matchId)],
    BETTING_PROGRAM_ID,
  )[0];
}

export function deriveAssociatedTokenAddress(owner, mint) {
  return PublicKey.findProgramAddressSync(
    [new PublicKey(owner).toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), new PublicKey(mint).toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

export function buildUpdateOddsInstruction(authority, matchId, odds, tag = "") {
  const data = encodeUpdateOddsData(matchId, odds, tag);
  return new TransactionInstruction({
    programId: ORACLE_PROGRAM_ID,
    keys: [
      { pubkey: authority.publicKey ?? new PublicKey(authority), isSigner: true, isWritable: true },
      { pubkey: deriveMatchPda(matchId), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function buildSettleBetInstruction(authority, bet, mint, oddsAtExpiryHome) {
  const user = new PublicKey(bet.user);
  const vaultAuthority = deriveVaultAuthorityPda(bet.matchId);
  return new TransactionInstruction({
    programId: BETTING_PROGRAM_ID,
    keys: [
      { pubkey: authority.publicKey ?? new PublicKey(authority), isSigner: true, isWritable: false },
      { pubkey: deriveBetPda(bet.matchId, user, bet.nonce), isSigner: false, isWritable: true },
      { pubkey: derivePoolPda(bet.matchId), isSigner: false, isWritable: true },
      { pubkey: vaultAuthority, isSigner: false, isWritable: false },
      { pubkey: deriveAssociatedTokenAddress(vaultAuthority, mint), isSigner: false, isWritable: true },
      { pubkey: deriveAssociatedTokenAddress(user, mint), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(mint), isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: encodeSettleBetData(oddsAtExpiryHome),
  });
}

export async function sendUpdateOdds(connection, authority, matchId, odds, tag = "") {
  return sendAndConfirmTransaction(
    connection,
    new Transaction().add(buildUpdateOddsInstruction(authority, matchId, odds, tag)),
    [authority],
    { commitment: "confirmed" },
  );
}

export function buildSetMatchStatusInstruction(authority, matchId, status) {
  const matchBytes = Buffer.from(matchId, "utf8");
  const data = Buffer.alloc(8 + 4 + matchBytes.length + 1);
  let offset = 0;
  Buffer.from(SET_MATCH_STATUS_DISCRIMINATOR).copy(data, offset);
  offset += 8;
  data.writeUInt32LE(matchBytes.length, offset);
  offset += 4;
  matchBytes.copy(data, offset);
  offset += matchBytes.length;
  data.writeUInt8(status, offset);

  return new TransactionInstruction({
    programId: ORACLE_PROGRAM_ID,
    keys: [
      { pubkey: authority.publicKey ?? new PublicKey(authority), isSigner: true, isWritable: false },
      { pubkey: deriveMatchPda(matchId), isSigner: false, isWritable: true },
    ],
    data,
  });
}

export async function sendSetMatchStatus(connection, authority, matchId, status) {
  return sendAndConfirmTransaction(
    connection,
    new Transaction().add(buildSetMatchStatusInstruction(authority, matchId, status)),
    [authority],
    { commitment: "confirmed" },
  );
}

export async function sendSettleBet(connection, authority, mint, bet, oddsAtExpiryHome) {
  return sendAndConfirmTransaction(
    connection,
    new Transaction().add(buildSettleBetInstruction(authority, bet, mint, oddsAtExpiryHome)),
    [authority],
    { commitment: "confirmed" },
  );
}

export async function fetchOpenBets(connection) {
  const accounts = await connection.getProgramAccounts(BETTING_PROGRAM_ID, {
    commitment: "confirmed",
    filters: [{ dataSize: BET_ACCOUNT_SIZE }],
  });

  return accounts
    .map(({ pubkey, account }) => ({ pubkey: pubkey.toBase58(), ...decodeBetAccount(account.data) }))
    .filter((bet) => bet.status === 0);
}

export async function fetchOpenMatches(connection) {
  const accounts = await connection.getProgramAccounts(ORACLE_PROGRAM_ID, {
    commitment: "confirmed",
    filters: [{ dataSize: MATCH_ACCOUNT_SIZE }],
  });

  return accounts
    .map(({ pubkey, account }) => ({ pubkey: pubkey.toBase58(), ...decodeMatchAccount(account.data) }))
    .filter((match) => match.status === 0);
}

export function decodeMatchAccount(data) {
  const buffer = Buffer.from(data);
  let offset = 8;

  const authority = new PublicKey(buffer.subarray(offset, offset + 32)).toBase58();
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
  const bump = buffer.readUInt8(offset);

  return {
    authority,
    id: matchId,
    tag,
    odds: { home: oddsHome, away: oddsAway, draw: oddsDraw },
    updatedAt: updatedAt.toString(),
    status,
    bump,
  };
}

export function decodeBetAccount(data) {
  const buffer = Buffer.from(data);
  let offset = 8;

  const user = new PublicKey(buffer.subarray(offset, offset + 32)).toBase58();
  offset += 32;
  const authority = new PublicKey(buffer.subarray(offset, offset + 32)).toBase58();
  offset += 32;
  const matchIdLength = buffer.readUInt32LE(offset);
  offset += 4;
  const matchId = buffer.subarray(offset, offset + matchIdLength).toString("utf8");
  offset += matchIdLength;
  const direction = buffer.readUInt8(offset);
  offset += 1;
  const oddsAtEntry = buffer.readUInt16LE(offset);
  offset += 2;
  const amount = buffer.readBigUInt64LE(offset);
  offset += 8;
  const payout = buffer.readBigUInt64LE(offset);
  offset += 8;
  const windowSecs = buffer.readUInt32LE(offset);
  offset += 4;
  const createdAt = Number(buffer.readBigInt64LE(offset));
  offset += 8;
  const expiresAt = Number(buffer.readBigInt64LE(offset));
  offset += 8;
  const status = buffer.readUInt8(offset);
  offset += 1;
  const nonce = buffer.readUInt32LE(offset);

  return {
    user,
    authority,
    matchId,
    direction,
    oddsAtEntry,
    amount: amount.toString(),
    payout: payout.toString(),
    windowSecs,
    createdAt,
    expiresAt,
    status,
    nonce,
  };
}

export function decodePoolAccount(data) {
  const buffer = Buffer.from(data);
  let offset = 8;

  const authority = new PublicKey(buffer.subarray(offset, offset + 32)).toBase58();
  offset += 32;
  const matchIdLength = buffer.readUInt32LE(offset);
  offset += 4;
  const matchId = buffer.subarray(offset, offset + matchIdLength).toString("utf8");
  offset += matchIdLength;
  const mint = new PublicKey(buffer.subarray(offset, offset + 32)).toBase58();
  offset += 32;
  const vault = new PublicKey(buffer.subarray(offset, offset + 32)).toBase58();
  offset += 32;
  const totalLiquidity = buffer.readBigUInt64LE(offset);
  offset += 8;
  const lockedLiquidity = buffer.readBigUInt64LE(offset);
  offset += 8;
  const feeRate = buffer.readUInt16LE(offset);
  offset += 2;
  const protocolFeesAccumulated = buffer.readBigUInt64LE(offset);
  offset += 8;
  const lpFeesAccumulated = buffer.readBigUInt64LE(offset);
  offset += 8;
  const feesPerShare = readU128LE(buffer, offset);
  offset += 16;
  const totalShares = buffer.readBigUInt64LE(offset);

  return {
    authority,
    matchId,
    mint,
    vault,
    totalLiquidity: totalLiquidity.toString(),
    lockedLiquidity: lockedLiquidity.toString(),
    feeRate,
    protocolFeesAccumulated: protocolFeesAccumulated.toString(),
    lpFeesAccumulated: lpFeesAccumulated.toString(),
    feesPerShare: feesPerShare.toString(),
    totalShares: totalShares.toString(),
  };
}

export function decodeLpPositionAccount(data) {
  const buffer = Buffer.from(data);
  let offset = 8;

  const owner = new PublicKey(buffer.subarray(offset, offset + 32)).toBase58();
  offset += 32;
  const pool = new PublicKey(buffer.subarray(offset, offset + 32)).toBase58();
  offset += 32;
  const shares = buffer.readBigUInt64LE(offset);
  offset += 8;
  const depositedAt = Number(buffer.readBigInt64LE(offset));
  offset += 8;
  const feesClaimedPerShare = readU128LE(buffer, offset);

  return {
    owner,
    pool,
    shares: shares.toString(),
    depositedAt,
    feesClaimedPerShare: feesClaimedPerShare.toString(),
  };
}

// Mirrors betting_engine::pending_fees.
export function pendingFees(pool, position) {
  const delta = BigInt(pool.feesPerShare) - BigInt(position.feesClaimedPerShare);
  if (delta <= 0n) {
    return "0";
  }
  return ((delta * BigInt(position.shares)) / FEE_SCALE).toString();
}

export async function fetchPoolState(connection) {
  const accounts = await connection.getProgramAccounts(BETTING_PROGRAM_ID, {
    commitment: "confirmed",
  });

  const pools = [];
  const positions = [];
  for (const { pubkey, account } of accounts) {
    const data = Buffer.from(account.data);
    if (startsWithBytes(data, POOL_ACCOUNT_DISCRIMINATOR)) {
      pools.push({ pubkey: pubkey.toBase58(), ...decodePoolAccount(data) });
    } else if (startsWithBytes(data, LP_POSITION_ACCOUNT_DISCRIMINATOR)) {
      positions.push({ pubkey: pubkey.toBase58(), ...decodeLpPositionAccount(data) });
    }
  }
  return { pools, positions };
}

function readU128LE(buffer, offset) {
  return buffer.readBigUInt64LE(offset) + (buffer.readBigUInt64LE(offset + 8) << 64n);
}

function startsWithBytes(buffer, prefix) {
  return prefix.every((byte, index) => buffer[index] === byte);
}

function encodeUpdateOddsData(matchId, odds, tag = "") {
  const matchBytes = Buffer.from(matchId, "utf8");
  const tagBytes = Buffer.from(tag, "utf8");
  const data = Buffer.alloc(8 + 4 + matchBytes.length + 6 + 4 + tagBytes.length);
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
  return data;
}

function encodeSettleBetData(oddsAtExpiryHome) {
  const data = Buffer.alloc(10);
  Buffer.from(SETTLE_BET_DISCRIMINATOR).copy(data, 0);
  data.writeUInt16LE(oddsAtExpiryHome, 8);
  return data;
}
