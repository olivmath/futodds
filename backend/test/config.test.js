import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.js";

test("loadConfig defaults odds polling to one minute", () => {
  assert.equal(loadConfig({}).pollIntervalMs, 60_000);
});

test("loadConfig allows overriding the odds polling interval", () => {
  assert.equal(loadConfig({ ODDS_POLL_INTERVAL_MS: "5000" }).pollIntervalMs, 5_000);
});

test("loadConfig defaults to generated odds source", () => {
  const config = loadConfig({});

  assert.equal(config.oddsSource, "generated");
  assert.equal(config.txline.apiOrigin, "https://txline-dev.txodds.com");
});

test("loadConfig supports TxLINE odds source settings", () => {
  const config = loadConfig({
    ODDS_SOURCE: "txline",
    TXLINE_API_ORIGIN: "https://txline-dev.txodds.com/",
    TXLINE_GUEST_JWT: "jwt_1",
    TXLINE_API_TOKEN: "api_1",
    TXLINE_SUPER_ODDS_TYPE: "1X2",
    TXLINE_MARKET_PERIOD: "FullTime",
    TXLINE_COMPETITION_ID: "72",
    TXLINE_START_EPOCH_DAY: "20624",
  });

  assert.equal(config.oddsSource, "txline");
  assert.equal(config.txline.apiOrigin, "https://txline-dev.txodds.com/");
  assert.equal(config.txline.guestJwt, "jwt_1");
  assert.equal(config.txline.apiToken, "api_1");
  assert.equal(config.txline.competitionId, 72);
  assert.equal(config.txline.startEpochDay, 20624);
});

test("loadConfig ignores match configuration because matches are discovered on-chain", () => {
  assert.equal("matches" in loadConfig({ MATCHES_JSON: '[{"id":"match_1"}]' }), false);
});

test("loadConfig supports localnet RPC and mint overrides", () => {
  const config = loadConfig({
    SOLANA_RPC_URL: "http://127.0.0.1:8899",
    TEST_USDC_MINT: "So11111111111111111111111111111111111111112",
    ORACLE_PROGRAM_ID: "BfWcrr3Mv4StpqSyaMUZtsLLUTM9cLkNeaARRdwSFSCN",
    BETTING_PROGRAM_ID: "FBXnZZHR3ndsE2oYak4EQaFTPZsEC7d34C8tQfE7hkm4",
  });

  assert.equal(config.rpcUrl, "http://127.0.0.1:8899");
  assert.equal(config.mint.toBase58(), "So11111111111111111111111111111111111111112");
  assert.equal(config.oracleProgramId.toBase58(), "BfWcrr3Mv4StpqSyaMUZtsLLUTM9cLkNeaARRdwSFSCN");
  assert.equal(config.bettingProgramId.toBase58(), "FBXnZZHR3ndsE2oYak4EQaFTPZsEC7d34C8tQfE7hkm4");
});
