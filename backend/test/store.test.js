import assert from "node:assert/strict";
import test from "node:test";
import { createStore } from "../src/store.js";

test("store tracks poller state, recent txs, errors and configured matches", () => {
  const store = createStore([{ id: "match_1", odds: { home: 6500, away: 3000, draw: 500 } }]);

  store.setPollerRunning(true);
  store.recordTx({ type: "update_odds", signature: "sig_1", matchId: "match_1" });
  store.recordError(new Error("rpc failed"));

  assert.equal(store.status.poller.running, true);
  assert.equal(store.status.matches[0].id, "match_1");
  assert.equal(store.status.txs[0].signature, "sig_1");
  assert.equal(store.status.errors[0].message, "rpc failed");
});
