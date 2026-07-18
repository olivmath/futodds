import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.js";

test("loadConfig defaults odds polling to one minute", () => {
  assert.equal(loadConfig({}).pollIntervalMs, 60_000);
});

test("loadConfig allows overriding the odds polling interval", () => {
  assert.equal(loadConfig({ ODDS_POLL_INTERVAL_MS: "5000" }).pollIntervalMs, 5_000);
});
