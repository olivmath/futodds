import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { createApp } from "../src/server.js";
import { createStore } from "../src/store.js";

const silentLogger = { info() {}, error() {} };

test("backend API allows browser calls from the Vite app", async () => {
  const server = createServer(
    createApp({
      store: createStore(),
      poller: { start() {}, stop() {} },
      settlementWorker: { runOnce: async () => ({ checked: 0, settled: 0 }) },
      logger: silentLogger,
    }),
  );

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/health`, {
      headers: { Origin: "http://localhost:5173" },
    });

    assert.equal(response.headers.get("access-control-allow-origin"), "*");
    assert.deepEqual(await response.json(), { ok: true });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("health endpoint renders an operational HTML page for browsers", async () => {
  const server = createServer(
    createApp({
      store: createStore(),
      poller: { start() {}, stop() {} },
      settlementWorker: { runOnce: async () => ({ checked: 0, settled: 0 }) },
      healthCheck: async () => ({
        ok: true,
        checkedAt: "2026-07-18T01:00:00.000Z",
        backend: { status: "online", uptimeSecs: 10, matches: 1, txs: 0, errors: 0 },
        blockchain: {
          status: "online",
          rpcUrl: "https://api.testnet.solana.com",
          version: "2.0.0",
          latestBlockhash: "abc123",
          authority: "He5N26TPqsKvbG1UJgj5QgVrEroz4hMjPdytMvx677AA",
          oracleProgram: "6BVWCCQDjQDcjQYhmbzJ9DFWY9LyDojM3mYoWivrASaG",
          bettingProgram: "GoccKzkMS5BWRmrbLdGKzqKUUcksZB3DftW82F7boCoQ",
        },
        poller: { running: false, lastRunAt: null },
        settlement: { running: false, lastRunAt: null },
      }),
      logger: silentLogger,
    }),
  );

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/health`, {
      headers: { Accept: "text/html" },
    });
    const html = await response.text();

    assert.equal(response.headers.get("content-type")?.includes("text/html"), true);
    assert.match(html, /FutOdds Backend Health/);
    assert.match(html, /Blockchain/);
    assert.match(html, /https:\/\/api\.testnet\.solana\.com/);
    assert.match(html, /oracle-adapter/);
    assert.match(html, /betting-engine/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("backend API handles CORS preflight", async () => {
  const server = createServer(
    createApp({
      store: createStore(),
      poller: { start() {}, stop() {} },
      settlementWorker: { runOnce: async () => ({ checked: 0, settled: 0 }) },
      logger: silentLogger,
    }),
  );

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/poller/start`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:5173",
        "Access-Control-Request-Method": "POST",
      },
    });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
    assert.match(response.headers.get("access-control-allow-methods") ?? "", /POST/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("backend API logs admin actions", async () => {
  const logs = [];
  const server = createServer(
    createApp({
      store: createStore(),
      poller: { start() {}, stop() {} },
      settlementWorker: { runOnce: async () => ({ checked: 0, settled: 0 }) },
      logger: { info: (event, details) => logs.push({ event, details }), error() {} },
    }),
  );

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");

  try {
    await fetch(`http://127.0.0.1:${address.port}/poller/start`, { method: "POST" });

    assert.ok(logs.some((log) => log.event === "admin.poller.start"));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("backend API registers per-match odds source metadata", async () => {
  const store = createStore();
  const server = createServer(
    createApp({
      store,
      poller: { start() {}, stop() {} },
      settlementWorker: { runOnce: async () => ({ checked: 0, settled: 0 }) },
      logger: silentLogger,
    }),
  );

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/matches/17588229/source`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oddsSource: "txline" }),
    });

    assert.equal(response.status, 200);
    assert.equal((await response.json()).oddsSource, "txline");
    store.replaceMatches([{ id: "17588229", odds: { home: 6500, away: 3000, draw: 500 }, status: 0 }]);
    assert.equal(store.getMatch("17588229")?.oddsSource, "txline");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("GET /leagues returns soccer leagues from the CSV", async () => {
  const server = createServer(
    createApp({
      store: createStore(),
      poller: { start() {}, stop() {} },
      settlementWorker: { runOnce: async () => ({ checked: 0, settled: 0 }) },
      logger: silentLogger,
    }),
  );

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/leagues`);
    assert.equal(response.status, 200);
    const leagues = await response.json();
    assert.ok(Array.isArray(leagues));
    assert.ok(leagues.length > 0);
    assert.ok(leagues[0].country);
    assert.ok(leagues[0].competition);
    assert.ok(typeof leagues[0].competitionId === "number");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("GET /fixtures proxies to txlineClient.fetchFixturesSnapshot", async () => {
  const fakeFixtures = [
    { FixtureId: 17588229, Home: "Arsenal", Away: "Chelsea" },
    { FixtureId: 17588230, Home: "Liverpool", Away: "Man City" },
  ];
  const txlineClient = {
    fetchFixturesSnapshot: async ({ competitionId }) => {
      assert.equal(competitionId, 8);
      return fakeFixtures;
    },
  };

  const server = createServer(
    createApp({
      store: createStore(),
      poller: { start() {}, stop() {} },
      settlementWorker: { runOnce: async () => ({ checked: 0, settled: 0 }) },
      txlineClient,
      logger: silentLogger,
    }),
  );

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/fixtures?competitionId=8`);
    assert.equal(response.status, 200);
    const fixtures = await response.json();
    assert.deepEqual(fixtures, fakeFixtures);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("GET /fixtures returns 503 when txlineClient is not configured", async () => {
  const server = createServer(
    createApp({
      store: createStore(),
      poller: { start() {}, stop() {} },
      settlementWorker: { runOnce: async () => ({ checked: 0, settled: 0 }) },
      txlineClient: null,
      logger: silentLogger,
    }),
  );

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/fixtures`);
    assert.equal(response.status, 503);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("backend API rejects invalid per-match odds source metadata", async () => {
  const server = createServer(
    createApp({
      store: createStore(),
      poller: { start() {}, stop() {} },
      settlementWorker: { runOnce: async () => ({ checked: 0, settled: 0 }) },
      logger: silentLogger,
    }),
  );

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/matches/17588229/source`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oddsSource: "manual" }),
    });

    assert.equal(response.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("GET /pools merges chain pools with store match info", async () => {
  const store = createStore();
  store.replaceMatches([
    { id: "match_1", tag: "BRA x ARG", odds: { home: 5000, away: 3000, draw: 2000 }, status: 0 },
  ]);
  store.setStreamStatus("match_1", "active");

  const server = createServer(
    createApp({
      store,
      poller: { start() {}, stop() {} },
      settlementWorker: { runOnce: async () => ({ checked: 0, settled: 0 }) },
      poolsMeta: { programId: "prog", rpcUrl: "http://rpc", mint: "mint" },
      fetchPoolState: async () => ({
        pools: [
          { pubkey: "poolA", matchId: "match_1", totalLiquidity: "1000000", feesPerShare: "0" },
          { pubkey: "poolB", matchId: "match_2", totalLiquidity: "2000000", feesPerShare: "0" },
        ],
        positions: [],
      }),
      logger: silentLogger,
    }),
  );

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/pools`);
    const body = await response.json();

    assert.equal(body.programId, "prog");
    assert.equal(body.mint, "mint");
    assert.equal(body.pools.length, 2);
    const [live, settled] = body.pools;
    assert.equal(live.status, "live");
    assert.equal(live.tag, "BRA x ARG");
    assert.deepEqual(live.odds, { home: 5000, away: 3000, draw: 2000 });
    assert.equal(settled.status, "settled");
    assert.equal(settled.tag, "");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("GET /pools/positions/:owner returns owner positions with pending fees", async () => {
  const server = createServer(
    createApp({
      store: createStore(),
      poller: { start() {}, stop() {} },
      settlementWorker: { runOnce: async () => ({ checked: 0, settled: 0 }) },
      fetchPoolState: async () => ({
        pools: [{ pubkey: "poolA", matchId: "match_1", feesPerShare: (3n * 10n ** 12n).toString() }],
        positions: [
          { pubkey: "posA", owner: "ownerA", pool: "poolA", shares: "2000000", depositedAt: 1700000000, feesClaimedPerShare: (1n * 10n ** 12n).toString() },
          { pubkey: "posB", owner: "ownerB", pool: "poolA", shares: "9000000", depositedAt: 1700000000, feesClaimedPerShare: "0" },
        ],
      }),
      logger: silentLogger,
    }),
  );

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/pools/positions/ownerA`);
    const body = await response.json();

    assert.equal(body.length, 1);
    assert.equal(body[0].matchId, "match_1");
    assert.equal(body[0].shares, "2000000");
    assert.equal(body[0].pendingFees, "4000000");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("GET /pools responds 503 when pool reads are unavailable", async () => {
  const server = createServer(
    createApp({
      store: createStore(),
      poller: { start() {}, stop() {} },
      settlementWorker: { runOnce: async () => ({ checked: 0, settled: 0 }) },
      logger: silentLogger,
    }),
  );

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/pools`);
    assert.equal(response.status, 503);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
