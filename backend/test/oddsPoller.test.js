import assert from "node:assert/strict";
import test from "node:test";
import { createOddsPoller } from "../src/oddsPoller.js";
import { createStore } from "../src/store.js";

test("odds poller sends update_odds only for active stream matches", async () => {
  const sent = [];
  const logs = [];
  const store = createStore();

  store.replaceMatches([{ id: "match_1", odds: { home: 6500, away: 3000, draw: 500 }, oddsSource: "txline-polling" }]);
  store.setStreamStatus("match_1", "active");
  store.setLatestOdds("match_1", { home: 1850, away: 2100, draw: 3200 });

  const poller = createOddsPoller({
    store,
    logger: { info: (event, details) => logs.push({ event, details }), error() {} },
    syncMatches: async () => store.listMatches(),
    sendUpdateOdds: async (matchId, odds, oddsSource) => {
      sent.push({ matchId, odds, oddsSource });
      return `sig_${matchId}`;
    },
  });

  await poller.runOnce();

  assert.deepEqual(sent, [{
    matchId: "match_1",
    odds: { home: 1850, away: 2100, draw: 3200 },
    oddsSource: "txline-polling",
  }]);
  assert.equal(store.status.matches[0].odds.home, 1850);
  assert.deepEqual(logs.map((log) => log.event), ["oracle.updated"]);
});

test("odds poller skips txline-realtime matches", async () => {
  const sent = [];
  const store = createStore();

  store.replaceMatches([
    { id: "match_1", odds: { home: 6500, away: 3000, draw: 500 }, oddsSource: "txline-polling" },
    { id: "match_2", odds: { home: 6400, away: 3100, draw: 500 }, oddsSource: "txline-realtime" },
  ]);
  store.setLatestOdds("match_1", { home: 1850, away: 2100, draw: 3200 });
  store.setLatestOdds("match_2", { home: 2000, away: 2000, draw: 3000 });

  const poller = createOddsPoller({
    store,
    logger: { info() {}, error() {} },
    syncMatches: async () => store.listMatches(),
    sendUpdateOdds: async (matchId, odds, oddsSource) => {
      sent.push({ matchId, odds, oddsSource });
      return `sig_${matchId}`;
    },
  });

  await poller.runOnce();

  assert.deepEqual(sent, [{
    matchId: "match_1",
    odds: { home: 1850, away: 2100, draw: 3200 },
    oddsSource: "txline-polling",
  }]);
});

test("odds poller skips matches without latestOdds", async () => {
  const sent = [];
  const store = createStore();

  store.replaceMatches([{ id: "match_1", odds: { home: 6500, away: 3000, draw: 500 }, oddsSource: "txline-polling" }]);
  store.setStreamStatus("match_1", "active");

  const poller = createOddsPoller({
    store,
    logger: { info() {}, error() {} },
    syncMatches: async () => store.listMatches(),
    sendUpdateOdds: async (matchId, odds) => {
      sent.push({ matchId, odds });
      return `sig_${matchId}`;
    },
  });

  await poller.runOnce();

  assert.deepEqual(sent, []);
});

test("odds poller fetches TxLINE odds using the persisted fixture ID", async () => {
  const sent = [];
  const store = createStore();
  store.replaceMatches([{
    id: "18257739-v2",
    fixtureId: "18257739",
    odds: { home: 3334, away: 3333, draw: 3333 },
    oddsSource: "txline-polling",
  }]);

  const poller = createOddsPoller({
    store,
    logger: { info() {}, error() {} },
    syncMatches: async () => store.listMatches(),
    fetchTxlineOdds: async (fixtureId) => {
      assert.equal(fixtureId, "18257739");
      return { home: 4200, away: 3300, draw: 2500 };
    },
    sendUpdateOdds: async (matchId, odds, oddsSource) => {
      sent.push({ matchId, odds, oddsSource });
      return "sig_txline";
    },
  });

  await poller.runOnce();

  assert.deepEqual(sent, [{
    matchId: "18257739-v2",
    odds: { home: 4200, away: 3300, draw: 2500 },
    oddsSource: "txline-polling",
  }]);
});
