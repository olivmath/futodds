import assert from "node:assert/strict";
import test from "node:test";
import { PublicKey } from "@solana/web3.js";
import {
  buildSettleBetInstruction,
  decodeBetAccount,
  decodeMatchAccount,
  deriveAssociatedTokenAddress,
  deriveBetPda,
  derivePoolPda,
  deriveVaultAuthorityPda,
  fetchOpenBets,
  fetchOpenMatches,
  TOKEN_PROGRAM_ID,
} from "../src/solana.js";

test("decodeBetAccount reads the on-chain Bet layout", () => {
  const user = new PublicKey("9xQeWvG816bUx9EPfNQht9C5WmrVKVdkVmv4s1KQTj4G");
  const authority = new PublicKey("He5N26TPqsKvbG1UJgj5QgVrEroz4hMjPdytMvx677AA");
  const data = buildBetAccountData({ user, authority, matchId: "match_1", status: 0, nonce: 7 });

  const bet = decodeBetAccount(data);

  assert.equal(bet.user, user.toBase58());
  assert.equal(bet.authority, authority.toBase58());
  assert.equal(bet.matchId, "match_1");
  assert.equal(bet.status, 0);
  assert.equal(bet.nonce, 7);
});

test("fetchOpenBets lists only open bets from betting program accounts", async () => {
  const open = buildBetAccountData({ matchId: "match_1", status: 0, nonce: 1 });
  const settled = buildBetAccountData({ matchId: "match_1", status: 1, nonce: 2 });
  const connection = {
    getProgramAccounts: async () => [
      { pubkey: new PublicKey("11111111111111111111111111111112"), account: { data: open } },
      { pubkey: new PublicKey("11111111111111111111111111111113"), account: { data: settled } },
    ],
  };

  const bets = await fetchOpenBets(connection);

  assert.equal(bets.length, 1);
  assert.equal(bets[0].nonce, 1);
});

test("decodeMatchAccount reads the on-chain MatchAccount layout with status", () => {
  const authority = new PublicKey("He5N26TPqsKvbG1UJgj5QgVrEroz4hMjPdytMvx677AA");
  const data = buildMatchAccountData({
    authority,
    matchId: "match_1",
    odds: { home: 6500, away: 3000, draw: 500 },
    updatedAt: 1_700_000_000,
    status: 0,
  });

  const match = decodeMatchAccount(data);

  assert.equal(match.authority, authority.toBase58());
  assert.equal(match.id, "match_1");
  assert.deepEqual(match.odds, { home: 6500, away: 3000, draw: 500 });
  assert.equal(match.updatedAt, "1700000000");
  assert.equal(match.status, 0);
});

test("fetchOpenMatches lists only open oracle match accounts", async () => {
  const open = buildMatchAccountData({ matchId: "match_1", status: 0 });
  const closed = buildMatchAccountData({ matchId: "match_2", status: 1 });
  const connection = {
    getProgramAccounts: async () => [
      { pubkey: new PublicKey("11111111111111111111111111111112"), account: { data: open } },
      { pubkey: new PublicKey("11111111111111111111111111111113"), account: { data: closed } },
    ],
  };

  const matches = await fetchOpenMatches(connection);

  assert.deepEqual(
    matches.map((match) => match.id),
    ["match_1"],
  );
});

test("buildSettleBetInstruction uses pool-backed betting accounts", () => {
  const authority = { publicKey: new PublicKey("He5N26TPqsKvbG1UJgj5QgVrEroz4hMjPdytMvx677AA") };
  const user = new PublicKey("9xQeWvG816bUx9EPfNQht9C5WmrVKVdkVmv4s1KQTj4G");
  const mint = new PublicKey("CDAQWBQ3DciCWQDtyczAWvTp3xuyuL2t273LSdffjxB");
  const bet = { user: user.toBase58(), matchId: "match_1", nonce: 7 };

  const ix = buildSettleBetInstruction(authority, bet, mint, 6700);
  const vaultAuthority = deriveVaultAuthorityPda("match_1");

  assert.deepEqual(
    ix.keys.map((key) => key.pubkey.toBase58()),
    [
      authority.publicKey.toBase58(),
      deriveBetPda("match_1", user, 7).toBase58(),
      derivePoolPda("match_1").toBase58(),
      vaultAuthority.toBase58(),
      deriveAssociatedTokenAddress(vaultAuthority, mint).toBase58(),
      deriveAssociatedTokenAddress(user, mint).toBase58(),
      mint.toBase58(),
      TOKEN_PROGRAM_ID.toBase58(),
    ],
  );
});

function buildBetAccountData({
  user = new PublicKey("9xQeWvG816bUx9EPfNQht9C5WmrVKVdkVmv4s1KQTj4G"),
  authority = new PublicKey("He5N26TPqsKvbG1UJgj5QgVrEroz4hMjPdytMvx677AA"),
  matchId,
  status,
  nonce,
}) {
  return Buffer.concat([
    Buffer.alloc(8),
    user.toBuffer(),
    authority.toBuffer(),
    writeString(matchId),
    Buffer.from([0]),
    writeU16(6500),
    writeU64(1_000_000n),
    writeU64(1_800_000n),
    writeU32(60),
    writeI64(1_700_000_000n),
    writeI64(1_700_000_060n),
    Buffer.from([status]),
    writeU32(nonce),
    Buffer.from([255]),
  ]);
}

function buildMatchAccountData({
  authority = new PublicKey("He5N26TPqsKvbG1UJgj5QgVrEroz4hMjPdytMvx677AA"),
  matchId,
  odds = { home: 6500, away: 3000, draw: 500 },
  updatedAt = 1_700_000_000,
  status,
}) {
  return Buffer.concat([
    Buffer.alloc(8),
    authority.toBuffer(),
    writeString(matchId),
    writeU16(odds.home),
    writeU16(odds.away),
    writeU16(odds.draw),
    writeI64(BigInt(updatedAt)),
    Buffer.from([status]),
    Buffer.from([255]),
  ]);
}

function writeString(value) {
  const bytes = Buffer.from(value, "utf8");
  return Buffer.concat([writeU32(bytes.length), bytes]);
}

function writeU16(value) {
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16LE(value);
  return bytes;
}

function writeU32(value) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value);
  return bytes;
}

function writeU64(value) {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(value);
  return bytes;
}

function writeI64(value) {
  const bytes = Buffer.alloc(8);
  bytes.writeBigInt64LE(value);
  return bytes;
}
