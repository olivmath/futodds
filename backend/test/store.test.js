import assert from "node:assert/strict";
import test from "node:test";
import { createStore } from "../src/store.js";

test("store tracks poller state, recent txs, errors and synced matches", () => {
  const store = createStore();

  store.replaceMatches([{ id: "match_1", odds: { home: 6500, away: 3000, draw: 500 }, status: 0 }]);

  store.setPollerRunning(true);
  store.recordTx({ type: "update_odds", signature: "sig_1", matchId: "match_1" });
  store.recordError(new Error("rpc failed"));

  assert.equal(store.status.poller.running, true);
  assert.equal(store.status.matches[0].id, "match_1");
  assert.equal(store.status.txs[0].signature, "sig_1");
  assert.equal(store.status.errors[0].message, "rpc failed");
});

test("store preserves match odds source metadata across synced matches", () => {
  const store = createStore();

  store.replaceMatches([{ id: "17588229", odds: { home: 6500, away: 3000, draw: 500 } }]);
  store.setMatchOddsSource("17588229", "txline");
  store.replaceMatches([{ id: "17588229", odds: { home: 6400, away: 3100, draw: 500 } }]);

  assert.equal(store.getMatch("17588229")?.oddsSource, "txline");
});

test("store can register odds source before a match is synced", () => {
  const store = createStore();

  store.setMatchOddsSource("17588229", "txline");
  store.replaceMatches([{ id: "17588229", odds: { home: 6500, away: 3000, draw: 500 } }]);

  assert.equal(store.getMatch("17588229")?.oddsSource, "txline");
});

test("store tracks stream status per match", () => {
  const store = createStore();

  store.replaceMatches([{ id: "match_1", odds: { home: 6500, away: 3000, draw: 500 } }]);

  assert.equal(store.getStreamStatus("match_1"), "inactive");

  store.setStreamStatus("match_1", "active");
  assert.equal(store.getStreamStatus("match_1"), "active");

  store.setStreamStatus("match_1", "paused");
  assert.equal(store.getStreamStatus("match_1"), "paused");
});

test("store caches latest odds from stream", () => {
  const store = createStore();

  store.replaceMatches([{ id: "match_1", odds: { home: 6500, away: 3000, draw: 500 } }]);

  assert.equal(store.getLatestOdds("match_1"), null);

  store.setLatestOdds("match_1", { home: 1850, away: 2100, draw: 3200 });
  const odds = store.getLatestOdds("match_1");

  assert.equal(odds.home, 1850);
  assert.equal(odds.away, 2100);
  assert.equal(odds.draw, 3200);
});

test("store associates fixture ID with match", () => {
  const store = createStore();

  store.replaceMatches([{ id: "match_1", odds: { home: 6500, away: 3000, draw: 500 } }]);

  store.setMatchFixture("match_1", 123);
  assert.equal(store.getFixtureId("match_1"), 123);
});

test("store includes stream metadata in status", () => {
  const store = createStore();

  store.replaceMatches([{ id: "match_1", odds: { home: 6500, away: 3000, draw: 500 } }]);
  store.setMatchFixture("match_1", 456);
  store.setStreamStatus("match_1", "active");

  const status = store.status;
  const match = status.matches[0];

  assert.equal(match.fixtureId, 456);
  assert.equal(match.streamStatus, "active");
});
