import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { createApp } from "../src/server.js";
import { createStore } from "../src/store.js";

const silentLogger = { info() {}, error() {} };

test("backend API allows browser calls from the Vite app", async () => {
  const server = createServer(
    createApp({
      store: createStore([]),
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
      store: createStore([{ id: "match_1", odds: { home: 6500, away: 3000, draw: 500 } }]),
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
      store: createStore([]),
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

test("backend API logs requests and admin actions", async () => {
  const logs = [];
  const server = createServer(
    createApp({
      store: createStore([]),
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

    assert.ok(logs.some((log) => log.event === "http.request" && log.details.path === "/poller/start"));
    assert.ok(logs.some((log) => log.event === "admin.poller.start"));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
