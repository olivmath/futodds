import assert from "node:assert/strict";
import test from "node:test";
import { AppConfig } from "../src/appConfig.js";

test("AppConfig is a singleton", () => {
  const instance1 = AppConfig.getInstance({
    SOLANA_RPC_URL: "http://127.0.0.1:8899",
    ORACLE_KEYPAIR: "~/.config/solana/id.json",
    ORACLE_PROGRAM_ID: "HwDVX9fTTxmnLBJwtig7ugsWuiqLh14pj71WtxQaaSSa",
    BETTING_PROGRAM_ID: "67mbZdR3KxZxRxgKDMT7JbxtYU92C1y81Q4KKGQRkMMY",
    TXLINE_API_ORIGIN: "https://txline-dev.txodds.com",
    TXLINE_GUEST_JWT: "test_jwt",
    TXLINE_API_TOKEN: "test_token",
  });
  const instance2 = AppConfig.getInstance();
  assert.equal(instance1, instance2);
});

test("AppConfig throws error when required env vars are missing", () => {
  assert.throws(() => {
    new AppConfig({
      SOLANA_RPC_URL: "http://127.0.0.1:8899",
      // missing other required vars
    });
  }, /Missing required environment variables/);
});

test("AppConfig loads all required fields", () => {
  const config = new AppConfig({
    SOLANA_RPC_URL: "http://127.0.0.1:8899",
    ORACLE_KEYPAIR: "~/.config/solana/id.json",
    ORACLE_PROGRAM_ID: "HwDVX9fTTxmnLBJwtig7ugsWuiqLh14pj71WtxQaaSSa",
    BETTING_PROGRAM_ID: "67mbZdR3KxZxRxgKDMT7JbxtYU92C1y81Q4KKGQRkMMY",
    TXLINE_API_ORIGIN: "https://txline-dev.txodds.com",
    TXLINE_GUEST_JWT: "test_jwt",
    TXLINE_API_TOKEN: "test_token",
  });

  assert.equal(config.solana.rpcUrl, "http://127.0.0.1:8899");
  assert.equal(config.backend.port, 8787);
  assert.equal(config.txline.apiOrigin, "https://txline-dev.txodds.com");
  assert.equal(config.txline.guestJwt, "test_jwt");
  assert.equal(config.txline.apiToken, "test_token");
});

test("AppConfig supports custom backend port", () => {
  const config = new AppConfig({
    PORT: "9999",
    SOLANA_RPC_URL: "http://127.0.0.1:8899",
    ORACLE_KEYPAIR: "~/.config/solana/id.json",
    ORACLE_PROGRAM_ID: "HwDVX9fTTxmnLBJwtig7ugsWuiqLh14pj71WtxQaaSSa",
    BETTING_PROGRAM_ID: "67mbZdR3KxZxRxgKDMT7JbxtYU92C1y81Q4KKGQRkMMY",
    TXLINE_API_ORIGIN: "https://txline-dev.txodds.com",
    TXLINE_GUEST_JWT: "test_jwt",
    TXLINE_API_TOKEN: "test_token",
  });

  assert.equal(config.backend.port, 9999);
});

test("AppConfig defaults poll interval to 60 seconds", () => {
  const config = new AppConfig({
    SOLANA_RPC_URL: "http://127.0.0.1:8899",
    ORACLE_KEYPAIR: "~/.config/solana/id.json",
    ORACLE_PROGRAM_ID: "HwDVX9fTTxmnLBJwtig7ugsWuiqLh14pj71WtxQaaSSa",
    BETTING_PROGRAM_ID: "67mbZdR3KxZxRxgKDMT7JbxtYU92C1y81Q4KKGQRkMMY",
    TXLINE_API_ORIGIN: "https://txline-dev.txodds.com",
    TXLINE_GUEST_JWT: "test_jwt",
    TXLINE_API_TOKEN: "test_token",
  });

  assert.equal(config.solana.pollIntervalMs, 60_000);
});

test("AppConfig supports custom poll interval", () => {
  const config = new AppConfig({
    ODDS_POLL_INTERVAL_MS: "5000",
    SOLANA_RPC_URL: "http://127.0.0.1:8899",
    ORACLE_KEYPAIR: "~/.config/solana/id.json",
    ORACLE_PROGRAM_ID: "HwDVX9fTTxmnLBJwtig7ugsWuiqLh14pj71WtxQaaSSa",
    BETTING_PROGRAM_ID: "67mbZdR3KxZxRxgKDMT7JbxtYU92C1y81Q4KKGQRkMMY",
    TXLINE_API_ORIGIN: "https://txline-dev.txodds.com",
    TXLINE_GUEST_JWT: "test_jwt",
    TXLINE_API_TOKEN: "test_token",
  });

  assert.equal(config.solana.pollIntervalMs, 5000);
});
