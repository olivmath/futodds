import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import {
  BETTING_PROGRAM_ID,
  DEFAULT_BETTING_PROGRAM_ID,
  DEFAULT_ORACLE_PROGRAM_ID,
  MATCH_ACCOUNT_SIZE,
  ORACLE_PROGRAM_ID,
  deriveAssociatedTokenAddress,
  deriveBetPda,
  deriveMatchPda,
  deriveVaultAuthorityPda,
  encodePlaceBetData,
  encodeSettleBetData,
  encodeUpdateOddsData,
  oddsAreValid,
  oddsSum,
  parseAnchorEventFromLogs,
  resolveBackofficeConfig,
} from "./solanaBackoffice";

describe("solana backoffice helpers", () => {
  it("keeps the deployed program IDs and account sizes visible to the app", () => {
    expect(DEFAULT_ORACLE_PROGRAM_ID.toBase58()).toBe("6BVWCCQDjQDcjQYhmbzJ9DFWY9LyDojM3mYoWivrASaG");
    expect(DEFAULT_BETTING_PROGRAM_ID.toBase58()).toBe("GoccKzkMS5BWRmrbLdGKzqKUUcksZB3DftW82F7boCoQ");
    expect(ORACLE_PROGRAM_ID.toBase58()).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/);
    expect(BETTING_PROGRAM_ID.toBase58()).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/);
    expect(MATCH_ACCOUNT_SIZE).toBe(95);
  });

  it("resolves localnet browser configuration from Vite env", () => {
    const config = resolveBackofficeConfig({
      VITE_SOLANA_RPC_URL: "http://127.0.0.1:8899",
      VITE_TEST_USDC_MINT: "So11111111111111111111111111111111111111112",
      VITE_BACKEND_URL: "http://127.0.0.1:8787",
      VITE_ORACLE_PROGRAM_ID: "BfWcrr3Mv4StpqSyaMUZtsLLUTM9cLkNeaARRdwSFSCN",
      VITE_BETTING_PROGRAM_ID: "FBXnZZHR3ndsE2oYak4EQaFTPZsEC7d34C8tQfE7hkm4",
    });

    expect(config.rpcUrl).toBe("http://127.0.0.1:8899");
    expect(config.testUsdcMint.toBase58()).toBe("So11111111111111111111111111111111111111112");
    expect(config.backendUrl).toBe("http://127.0.0.1:8787");
    expect(config.oracleProgramId.toBase58()).toBe("BfWcrr3Mv4StpqSyaMUZtsLLUTM9cLkNeaARRdwSFSCN");
    expect(config.bettingProgramId.toBase58()).toBe("FBXnZZHR3ndsE2oYak4EQaFTPZsEC7d34C8tQfE7hkm4");
  });

  it("validates odds exactly like the oracle program", () => {
    expect(oddsSum({ home: 6500, away: 3000, draw: 500 })).toBe(10_000);
    expect(oddsAreValid({ home: 6500, away: 3000, draw: 500 })).toBe(true);
    expect(oddsAreValid({ home: 6500, away: 3000, draw: 600 })).toBe(false);
  });

  it("derives the PDAs and token accounts used by phase 0 and 1", () => {
    const user = new PublicKey("He5N26TPqsKvbG1UJgj5QgVrEroz4hMjPdytMvx677AA");
    const mint = new PublicKey("So11111111111111111111111111111111111111112");

    expect(deriveMatchPda("match_1").toBase58()).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/);
    expect(deriveBetPda("match_1", user, 7).toBase58()).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/);
    expect(deriveVaultAuthorityPda("match_1").toBase58()).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/);
    expect(deriveAssociatedTokenAddress(user, mint).toBase58()).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/);
  });

  it("encodes Anchor instruction data for oracle and betting calls", () => {
    const updateOdds = encodeUpdateOddsData("match_1", { home: 6500, away: 3000, draw: 500 });
    const placeBet = encodePlaceBetData({ direction: 1, windowSecs: 300, amount: 50_000_000n, nonce: 3 });
    const settleBet = encodeSettleBetData(6300);

    expect([...updateOdds.subarray(0, 8)]).toEqual([185, 97, 196, 202, 171, 32, 3, 160]);
    expect(updateOdds.readUInt16LE(updateOdds.length - 6)).toBe(6500);
    expect([...placeBet.subarray(0, 8)]).toEqual([222, 62, 67, 220, 63, 166, 126, 33]);
    expect(placeBet.readUInt8(8)).toBe(1);
    expect(placeBet.readUInt32LE(9)).toBe(300);
    expect([...settleBet.subarray(0, 8)]).toEqual([115, 55, 234, 177, 227, 4, 10, 67]);
    expect(settleBet.readUInt16LE(8)).toBe(6300);
  });

  it("ignores malformed Anchor event logs instead of crashing realtime listeners", () => {
    const truncatedOddsUpdatedPayload = Buffer.from([156, 39, 18, 117, 46, 12, 46, 218, 1, 2, 3]);

    expect(
      parseAnchorEventFromLogs([
        "Program log: Instruction: UpdateOdds",
        `Program data: ${truncatedOddsUpdatedPayload.toString("base64")}`,
      ]),
    ).toBeNull();
  });
});
