import assert from "node:assert/strict";
import test from "node:test";
import { createSettlementWorker } from "../src/settlementWorker.js";
import { createStore } from "../src/store.js";

test("settlement worker settles only open expired bets", async () => {
  const settled = [];
  const store = createStore([{ id: "match_1", odds: { home: 6700, away: 2800, draw: 500 } }]);
  const worker = createSettlementWorker({
    store,
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
});
