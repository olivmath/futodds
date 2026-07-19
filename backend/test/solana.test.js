import assert from "node:assert/strict";
import test from "node:test";
import { PublicKey } from "@solana/web3.js";
import {
  buildUpdateOddsInstruction,
  buildSettleBetInstruction,
  decodeBetAccount,
  decodeLpPositionAccount,
  decodeMatchAccount,
  decodePoolAccount,
  deriveAssociatedTokenAddress,
  deriveBetPda,
  derivePoolPda,
  deriveVaultAuthorityPda,
  fetchOpenBets,
  fetchOpenMatches,
  fetchPoolState,
  pendingFees,
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
    tag: "Test Game",
    odds: { home: 6500, away: 3000, draw: 500 },
    updatedAt: 1_700_000_000,
    status: 0,
  });

  const match = decodeMatchAccount(data);

  assert.equal(match.authority, authority.toBase58());
  assert.equal(match.id, "match_1");
  assert.equal(match.tag, "Test Game");
  assert.deepEqual(match.odds, { home: 6500, away: 3000, draw: 500 });
  assert.equal(match.updatedAt, "1700000000");
  assert.equal(match.status, 0);
  assert.equal(match.oddsSource, "txline-polling");
});

test("buildUpdateOddsInstruction encodes the legacy on-chain odds source", () => {
  const authority = { publicKey: new PublicKey("He5N26TPqsKvbG1UJgj5QgVrEroz4hMjPdytMvx677AA") };
  const odds = { home: 5000, away: 3000, draw: 2000 };

  const txline = buildUpdateOddsInstruction(authority, "match_1", odds, "Game", "txline-realtime");
  const random = buildUpdateOddsInstruction(authority, "match_1", odds, "Game", "random");

  assert.equal(txline.data.at(-1), 1);
  assert.equal(random.data.at(-1), 0);
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

test("decodePoolAccount reads the on-chain Pool layout", () => {
  const data = buildPoolAccountData({ matchId: "match_1" });

  const pool = decodePoolAccount(data);

  assert.equal(pool.matchId, "match_1");
  assert.equal(pool.totalLiquidity, "182450000000");
  assert.equal(pool.lockedLiquidity, "121300000000");
  assert.equal(pool.feeRate, 200);
  assert.equal(pool.protocolFeesAccumulated, "728000000");
  assert.equal(pool.lpFeesAccumulated, "2184500000");
  assert.equal(pool.feesPerShare, (5n * 10n ** 12n).toString());
  assert.equal(pool.totalShares, "175000000000");
});

test("decodeLpPositionAccount reads the on-chain LpPosition layout", () => {
  const owner = new PublicKey("9xQeWvG816bUx9EPfNQht9C5WmrVKVdkVmv4s1KQTj4G");
  const pool = new PublicKey("He5N26TPqsKvbG1UJgj5QgVrEroz4hMjPdytMvx677AA");
  const data = buildLpPositionAccountData({ owner, pool, shares: 5_000_000_000n });

  const position = decodeLpPositionAccount(data);

  assert.equal(position.owner, owner.toBase58());
  assert.equal(position.pool, pool.toBase58());
  assert.equal(position.shares, "5000000000");
  assert.equal(position.depositedAt, 1_700_000_000);
  assert.equal(position.feesClaimedPerShare, (2n * 10n ** 12n).toString());
});

test("pendingFees mirrors the program's fees_per_share math", () => {
  const pool = { feesPerShare: (5n * 10n ** 12n).toString() };
  const position = { feesClaimedPerShare: (2n * 10n ** 12n).toString(), shares: "5000000000" };

  // (5 - 2) scaled units per share * 5_000 shares = 15_000 base units
  assert.equal(pendingFees(pool, position), "15000000000");
  assert.equal(pendingFees({ feesPerShare: "0" }, { feesClaimedPerShare: "0", shares: "10" }), "0");
});

test("fetchPoolState splits pools and lp positions by discriminator", async () => {
  const connection = {
    getProgramAccounts: async () => [
      { pubkey: new PublicKey("11111111111111111111111111111112"), account: { data: buildPoolAccountData({ matchId: "match_1" }) } },
      { pubkey: new PublicKey("11111111111111111111111111111113"), account: { data: buildLpPositionAccountData({}) } },
      { pubkey: new PublicKey("11111111111111111111111111111114"), account: { data: buildBetAccountData({ matchId: "match_1", status: 0, nonce: 1 }) } },
    ],
  };

  const { pools, positions } = await fetchPoolState(connection);

  assert.equal(pools.length, 1);
  assert.equal(pools[0].matchId, "match_1");
  assert.equal(positions.length, 1);
  assert.equal(positions[0].shares, "1000000000");
});

const POOL_DISCRIMINATOR = Buffer.from([241, 154, 109, 4, 17, 177, 109, 188]);
const LP_POSITION_DISCRIMINATOR = Buffer.from([105, 241, 37, 200, 224, 2, 252, 90]);

function buildPoolAccountData({
  authority = new PublicKey("He5N26TPqsKvbG1UJgj5QgVrEroz4hMjPdytMvx677AA"),
  matchId,
  mint = new PublicKey("CDAQWBQ3DciCWQDtyczAWvTp3xuyuL2t273LSdffjxB"),
  vault = new PublicKey("9xQeWvG816bUx9EPfNQht9C5WmrVKVdkVmv4s1KQTj4G"),
}) {
  return Buffer.concat([
    POOL_DISCRIMINATOR,
    authority.toBuffer(),
    writeString(matchId),
    mint.toBuffer(),
    vault.toBuffer(),
    writeU64(182_450_000_000n),
    writeU64(121_300_000_000n),
    writeU16(200),
    writeU64(728_000_000n),
    writeU64(2_184_500_000n),
    writeU128(5n * 10n ** 12n),
    writeU64(175_000_000_000n),
    Buffer.from([255]),
    Buffer.from([254]),
  ]);
}

function buildLpPositionAccountData({
  owner = new PublicKey("9xQeWvG816bUx9EPfNQht9C5WmrVKVdkVmv4s1KQTj4G"),
  pool = new PublicKey("He5N26TPqsKvbG1UJgj5QgVrEroz4hMjPdytMvx677AA"),
  shares = 1_000_000_000n,
}) {
  return Buffer.concat([
    LP_POSITION_DISCRIMINATOR,
    owner.toBuffer(),
    pool.toBuffer(),
    writeU64(shares),
    writeI64(1_700_000_000n),
    writeU128(2n * 10n ** 12n),
    Buffer.from([255]),
  ]);
}

function writeU128(value) {
  const bytes = Buffer.alloc(16);
  bytes.writeBigUInt64LE(value & 0xffffffffffffffffn, 0);
  bytes.writeBigUInt64LE(value >> 64n, 8);
  return bytes;
}

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
  tag = "",
  odds = { home: 6500, away: 3000, draw: 500 },
  updatedAt = 1_700_000_000,
  status,
  oddsSource = 1,
}) {
  return Buffer.concat([
    Buffer.alloc(8),
    authority.toBuffer(),
    writeString(matchId),
    writeString(tag),
    writeU16(odds.home),
    writeU16(odds.away),
    writeU16(odds.draw),
    writeI64(BigInt(updatedAt)),
    Buffer.from([status]),
    Buffer.from([oddsSource]),
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
