import { PublicKey } from "@solana/web3.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_ORACLE_PROGRAM_ID = "HwDVX9fTTxmnLBJwtig7ugsWuiqLh14pj71WtxQaaSSa";
const DEFAULT_BETTING_PROGRAM_ID = "67mbZdR3KxZxRxgKDMT7JbxtYU92C1y81Q4KKGQRkMMY";

class AppConfig {
  static #instance = null;

  constructor(env = process.env) {
    this.validateAndLoad(env);
  }

  validateAndLoad(env) {
    const required = [
      "SOLANA_RPC_URL",
      "ORACLE_KEYPAIR",
      "ORACLE_PROGRAM_ID",
      "BETTING_PROGRAM_ID",
      "TXLINE_API_ORIGIN",
      "TXLINE_GUEST_JWT",
      "TXLINE_API_TOKEN",
    ];

    const missing = required.filter((key) => !env[key]);
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
    }

    this.backend = {
      port: Number(env.PORT ?? 8787),
    };

    this.solana = {
      rpcUrl: env.SOLANA_RPC_URL,
      keypairPath: expandHome(env.ORACLE_KEYPAIR),
      pollIntervalMs: Number(env.ODDS_POLL_INTERVAL_MS ?? 60_000),
      settlementIntervalMs: Number(env.SETTLEMENT_INTERVAL_MS ?? 10_000),
      mint: new PublicKey(env.TEST_USDC_MINT ?? "CDAQWBQ3DciCWQDtyczAWvTp3xuyuL2t273LSdffjxB"),
      oracleProgramId: new PublicKey(env.ORACLE_PROGRAM_ID ?? DEFAULT_ORACLE_PROGRAM_ID),
      bettingProgramId: new PublicKey(env.BETTING_PROGRAM_ID ?? DEFAULT_BETTING_PROGRAM_ID),
    };

    this.txline = {
      apiOrigin: env.TXLINE_API_ORIGIN,
      guestJwt: env.TXLINE_GUEST_JWT,
      apiToken: env.TXLINE_API_TOKEN,
      superOddsType: env.TXLINE_SUPER_ODDS_TYPE ?? "1X2",
      marketPeriod: env.TXLINE_MARKET_PERIOD ?? "FullTime",
      competitionId: env.TXLINE_COMPETITION_ID ? Number(env.TXLINE_COMPETITION_ID) : undefined,
      startEpochDay: env.TXLINE_START_EPOCH_DAY ? Number(env.TXLINE_START_EPOCH_DAY) : undefined,
    };
  }

  static getInstance(env = process.env) {
    if (!this.#instance) {
      this.#instance = new AppConfig(env);
    }
    return this.#instance;
  }
}

function expandHome(filePath) {
  return filePath.startsWith("~/") ? path.join(os.homedir(), filePath.slice(2)) : filePath;
}

export { AppConfig };
