import assert from "node:assert/strict";
import test from "node:test";
import { createLogger } from "../src/logger.js";

test("logger logs only critical events", () => {
  const logs = [];
  const sink = {
    log: (line) => logs.push(JSON.parse(line)),
    error: (line) => logs.push(JSON.parse(line)),
  };

  const logger = createLogger({ sink });

  logger.info("game.created", { matchId: "match1" });
  logger.info("http.response", { status: 200 });
  logger.info("stream.started", { matchId: "match2" });

  assert.equal(logs.length, 2);
  assert.equal(logs[0].event, "game.created");
  assert.equal(logs[1].event, "stream.started");
});

test("logger includes details in payload", () => {
  const logs = [];
  const sink = {
    log: (line) => logs.push(JSON.parse(line)),
    error: (line) => logs.push(JSON.parse(line)),
  };

  const logger = createLogger({ sink });

  logger.info("oracle.updated", { matchId: "match1", odds: { home: 1.85 } });

  assert.equal(logs.length, 1);
  assert.equal(logs[0].event, "oracle.updated");
  assert.equal(logs[0].matchId, "match1");
  assert.equal(logs[0].odds.home, 1.85);
});

test("logger logs errors with error level", () => {
  const logs = [];
  const sink = {
    log: (line) => logs.push(JSON.parse(line)),
    error: (line) => logs.push(JSON.parse(line)),
  };

  const logger = createLogger({ sink });

  logger.error("error.fatal", { message: "Connection failed" });

  assert.equal(logs.length, 1);
  assert.equal(logs[0].level, "error");
  assert.equal(logs[0].event, "error.fatal");
});

test("logger ignores non-critical events", () => {
  const logs = [];
  const sink = {
    log: (line) => logs.push(JSON.parse(line)),
    error: (line) => logs.push(JSON.parse(line)),
  };

  const logger = createLogger({ sink });

  logger.info("poller.run.start", {});
  logger.info("poller.fetch.odds", {});
  logger.info("game.created", {});

  assert.equal(logs.length, 1);
  assert.equal(logs[0].event, "game.created");
});
