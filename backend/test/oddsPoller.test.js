import assert from "node:assert/strict";
import test from "node:test";
import { createOddsPoller, nextGeneratedOdds } from "../src/oddsPoller.js";
import { createStore } from "../src/store.js";

test("nextGeneratedOdds keeps odds normalized to 10000", () => {
  assert.deepEqual(nextGeneratedOdds({ home: 6500, away: 3000, draw: 500 }), {
    home: 6600,
    away: 2900,
    draw: 500,
  });
});

test("odds poller sends one update_odds tx per configured match", async () => {
  const sent = [];
  const store = createStore([{ id: "match_1", odds: { home: 6500, away: 3000, draw: 500 } }]);
  const poller = createOddsPoller({
    store,
    sendUpdateOdds: async (matchId, odds) => {
      sent.push({ matchId, odds });
      return `sig_${matchId}`;
    },
  });

  await poller.runOnce();

  assert.deepEqual(sent, [{ matchId: "match_1", odds: { home: 6600, away: 2900, draw: 500 } }]);
  assert.equal(store.status.matches[0].odds.home, 6600);
  assert.equal(store.status.txs[0].signature, "sig_match_1");
});
