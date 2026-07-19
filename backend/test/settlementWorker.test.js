import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { createSettlementWorker } from "../src/settlementWorker.js";
import { createStore } from "../src/store.js";

test("settlement worker settles only open expired bets", async () => {
  const settled = [];
  const logs = [];
  const store = createStore();
  store.replaceMatches([{ id: "match_1", odds: { home: 6700, away: 2800, draw: 500 }, status: 0 }]);
  const worker = createSettlementWorker({
    store,
    logger: { info: (event, details) => logs.push({ event, details }), error() {} },
    now: () => 1_700_000_100,
    fetchOpenBets: async () => [
      { user: "user_1", matchId: "match_1", nonce: 1, expiresAt: 1_700_000_090, status: 0 },
      { user: "user_2", matchId: "match_1", nonce: 2, expiresAt: 1_700_000_120, status: 0 },
      { user: "user_3", matchId: "match_1", nonce: 3, expiresAt: 1_700_000_080, status: 1 },
    ],
    settleBet: async (bet, oddsAtExpiryHome) => {
      settled.push({ bet, oddsAtExpiryHome });
      return `settled_${bet.nonce}`;
    },
  });

  const result = await worker.runOnce();

  assert.equal(result.checked, 3);
  assert.equal(result.settled, 1);
  assert.equal(settled[0].bet.user, "user_1");
  assert.equal(settled[0].oddsAtExpiryHome, 6700);
  assert.equal(store.status.txs[0].signature, "settled_1");
  assert.deepEqual(logs.map((log) => log.event), [
    "settlement.run.start",
    "settlement.bets.fetched",
    "settlement.bet.settle",
    "settlement.bet.settled",
    "settlement.bet.skip",
    "settlement.bet.skip",
    "settlement.run.done",
  ]);
});

test("settlement worker records a failed bet and continues the run", async () => {
  const settled = [];
  const store = createStore();
  store.replaceMatches([{ id: "match_1", odds: { home: 6700, away: 2800, draw: 500 }, status: 0 }]);
  const worker = createSettlementWorker({
    store,
    logger: { info() {}, error() {} },
    now: () => 1_700_000_100,
    fetchOpenBets: async () => [
      { user: "user_1", matchId: "match_1", nonce: 1, expiresAt: 1_700_000_090, status: 0 },
      { user: "user_2", matchId: "match_1", nonce: 2, expiresAt: 1_700_000_080, status: 0 },
    ],
    settleBet: async (bet) => {
      if (bet.nonce === 1) {
        throw new Error("settlement tx failed");
      }
      settled.push(bet.nonce);
      return `settled_${bet.nonce}`;
    },
  });

  const result = await worker.runOnce();

  assert.deepEqual(result, { checked: 2, settled: 1, failed: 1 });
  assert.deepEqual(settled, [2]);
  assert.equal(store.status.errors[0].message, "settlement tx failed");
  assert.equal(store.status.txs[0].signature, "settled_2");
});

test("start() runs settlement on interval and stop() halts it", async () => {
  let runs = 0;
  const store = createStore();
  store.replaceMatches([{ id: "match_1", odds: { home: 5000, away: 3000, draw: 2000 }, status: 0 }]);
  const worker = createSettlementWorker({
    store,
    logger: { info() {}, error() {} },
    intervalMs: 50,
    now: () => 1_700_000_100,
    fetchOpenBets: async () => {
      runs++;
      return [];
    },
    settleBet: async () => "sig",
  });

  worker.start();
  await delay(130);
  worker.stop();
  const runsAfterStop = runs;
  await delay(80);

  assert.ok(runs >= 2, `expected at least 2 runs, got ${runs}`);
  assert.equal(runs, runsAfterStop, "no runs after stop");
});
