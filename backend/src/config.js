import { Keypair, PublicKey } from "@solana/web3.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_MATCHES = [
  { id: "match_1", odds: { home: 6500, away: 3000, draw: 500 } },
];
const DEFAULT_ORACLE_PROGRAM_ID = "6BVWCCQDjQDcjQYhmbzJ9DFWY9LyDojM3mYoWivrASaG";
const DEFAULT_BETTING_PROGRAM_ID = "GoccKzkMS5BWRmrbLdGKzqKUUcksZB3DftW82F7boCoQ";

export function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT ?? 8787),
    rpcUrl: env.SOLANA_RPC_URL ?? "https://api.testnet.solana.com",
    keypairPath: expandHome(env.ORACLE_KEYPAIR ?? "~/.config/solana/id.json"),
    pollIntervalMs: Number(env.ODDS_POLL_INTERVAL_MS ?? 60_000),
    mint: new PublicKey(env.TEST_USDC_MINT ?? "CDAQWBQ3DciCWQDtyczAWvTp3xuyuL2t273LSdffjxB"),
    oracleProgramId: new PublicKey(env.ORACLE_PROGRAM_ID ?? DEFAULT_ORACLE_PROGRAM_ID),
    bettingProgramId: new PublicKey(env.BETTING_PROGRAM_ID ?? DEFAULT_BETTING_PROGRAM_ID),
    matches: env.MATCHES_JSON ? JSON.parse(env.MATCHES_JSON) : DEFAULT_MATCHES,
  };
}

export function loadKeypair(filePath) {
  const bytes = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}

function expandHome(filePath) {
  return filePath.startsWith("~/") ? path.join(os.homedir(), filePath.slice(2)) : filePath;
}
