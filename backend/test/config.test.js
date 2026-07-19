import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.js";

test("loadConfig defaults odds polling to one minute", () => {
  assert.equal(loadConfig({}).pollIntervalMs, 60_000);
});

test("loadConfig allows overriding the odds polling interval", () => {
  assert.equal(loadConfig({ ODDS_POLL_INTERVAL_MS: "5000" }).pollIntervalMs, 5_000);
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
