import {
  Connection,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";

export const ORACLE_PROGRAM_ID = new PublicKey("6BVWCCQDjQDcjQYhmbzJ9DFWY9LyDojM3mYoWivrASaG");
export const BETTING_PROGRAM_ID = new PublicKey("GoccKzkMS5BWRmrbLdGKzqKUUcksZB3DftW82F7boCoQ");
export const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
export const BET_ACCOUNT_SIZE = 157;

const UPDATE_ODDS_DISCRIMINATOR = Uint8Array.from([185, 97, 196, 202, 171, 32, 3, 160]);
const SETTLE_BET_DISCRIMINATOR = Uint8Array.from([115, 55, 234, 177, 227, 4, 10, 67]);

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

export function deriveVaultAuthorityPda(matchId) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), Buffer.from(matchId)],
    BETTING_PROGRAM_ID,
  )[0];
}

export function deriveAssociatedTokenAddress(owner, mint) {
  return PublicKey.findProgramAddressSync(
    [new PublicKey(owner).toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), new PublicKey(mint).toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

export function buildUpdateOddsInstruction(authority, matchId, odds) {
  const data = encodeUpdateOddsData(matchId, odds);
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
      { pubkey: vaultAuthority, isSigner: false, isWritable: false },
      { pubkey: deriveAssociatedTokenAddress(vaultAuthority, mint), isSigner: false, isWritable: true },
      { pubkey: deriveAssociatedTokenAddress(user, mint), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(mint), isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: encodeSettleBetData(oddsAtExpiryHome),
  });
}

export async function sendUpdateOdds(connection, authority, matchId, odds) {
  return sendAndConfirmTransaction(
    connection,
    new Transaction().add(buildUpdateOddsInstruction(authority, matchId, odds)),
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

function encodeUpdateOddsData(matchId, odds) {
  const matchBytes = Buffer.from(matchId, "utf8");
  const data = Buffer.alloc(8 + 4 + matchBytes.length + 6);
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

function encodeSettleBetData(oddsAtExpiryHome) {
  const data = Buffer.alloc(10);
  Buffer.from(SETTLE_BET_DISCRIMINATOR).copy(data, 0);
  data.writeUInt16LE(oddsAtExpiryHome, 8);
  return data;
}
