import { Keypair, PublicKey } from "@solana/web3.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_ORACLE_PROGRAM_ID = "HwDVX9fTTxmnLBJwtig7ugsWuiqLh14pj71WtxQaaSSa";
const DEFAULT_BETTING_PROGRAM_ID = "67mbZdR3KxZxRxgKDMT7JbxtYU92C1y81Q4KKGQRkMMY";

export function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT ?? 8787),
    rpcUrl: env.SOLANA_RPC_URL ?? "http://127.0.0.1:8899",
    keypairPath: expandHome(env.ORACLE_KEYPAIR ?? "~/.config/solana/id.json"),
    pollIntervalMs: Number(env.ODDS_POLL_INTERVAL_MS ?? 60_000),
    mint: new PublicKey(env.TEST_USDC_MINT ?? "CDAQWBQ3DciCWQDtyczAWvTp3xuyuL2t273LSdffjxB"),
    oracleProgramId: new PublicKey(env.ORACLE_PROGRAM_ID ?? DEFAULT_ORACLE_PROGRAM_ID),
    bettingProgramId: new PublicKey(env.BETTING_PROGRAM_ID ?? DEFAULT_BETTING_PROGRAM_ID),
    oddsSource: env.ODDS_SOURCE ?? "generated",
    txline: {
      apiOrigin: env.TXLINE_API_ORIGIN ?? "https://txline-dev.txodds.com",
      guestJwt: env.TXLINE_GUEST_JWT ?? "",
      apiToken: env.TXLINE_API_TOKEN ?? "",
      superOddsType: env.TXLINE_SUPER_ODDS_TYPE ?? "1X2",
      marketPeriod: env.TXLINE_MARKET_PERIOD ?? "FullTime",
      competitionId: env.TXLINE_COMPETITION_ID ? Number(env.TXLINE_COMPETITION_ID) : undefined,
      startEpochDay: env.TXLINE_START_EPOCH_DAY ? Number(env.TXLINE_START_EPOCH_DAY) : undefined,
    },
  };
}

export function loadKeypair(filePath) {
  const bytes = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}

function expandHome(filePath) {
  return filePath.startsWith("~/") ? path.join(os.homedir(), filePath.slice(2)) : filePath;
}
