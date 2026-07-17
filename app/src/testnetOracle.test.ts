import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import {
  BETTING_ENGINE_PROGRAM_ID,
  MATCH_ACCOUNT_SIZE,
  PROGRAM_ID,
  buildCreateAssociatedTokenAccountInstruction,
  buildMatchAccountFilters,
  buildPlaceBetInstruction,
  buildSettleBetInstruction,
  buildUserBetFilters,
  deriveAssociatedTokenAddress,
  deriveBetPda,
  deriveMatchPda,
  deriveVaultAuthorityPda,
  encodePlaceBetData,
  encodeSettleBetData,
  encodeUpdateOddsData,
  formatTokenUnits,
  oddsAreValid,
  oddsSum,
  resolveWalletPublicKey,
  usdcToUnits,
} from "./testnetOracle";

describe("phase 0 oracle helpers", () => {
  it("validates odds sum exactly as the on-chain program expects", () => {
    expect(oddsSum({ home: 6500, away: 3000, draw: 500 })).toBe(10_000);
    expect(oddsAreValid({ home: 6500, away: 3000, draw: 500 })).toBe(true);
    expect(oddsAreValid({ home: 6500, away: 3000, draw: 600 })).toBe(false);
  });

  it("derives the match PDA with the phase 0 seed contract", () => {
    const pda = deriveMatchPda("match_1");

    expect(pda.toBase58()).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/);
    expect(PUBLIC_PROGRAM_ID).toBe(PROGRAM_ID.toBase58());
  });

  it("encodes update_odds instruction data with Anchor discriminator and borsh args", () => {
    const data = encodeUpdateOddsData("match_1", {
      home: 6500,
      away: 3000,
      draw: 500,
    });

    expect([...data.subarray(0, 8)]).toEqual([185, 97, 196, 202, 171, 32, 3, 160]);
    expect(data.readUInt32LE(8)).toBe("match_1".length);
    expect(data.readUInt16LE(data.length - 6)).toBe(6500);
    expect(data.readUInt16LE(data.length - 4)).toBe(3000);
    expect(data.readUInt16LE(data.length - 2)).toBe(500);
  });

  it("resolves the wallet public key when the connect result is empty", () => {
    const providerPublicKey = deriveMatchPda("wallet_provider_key");

    expect(resolveWalletPublicKey(undefined, providerPublicKey)).toBe(providerPublicKey);
  });

  it("derives betting PDAs and associated token accounts", () => {
    const user = new PublicKey("He5N26TPqsKvbG1UJgj5QgVrEroz4hMjPdytMvx677AA");
    const mint = new PublicKey("So11111111111111111111111111111111111111112");

    expect(deriveBetPda("match_1", user, 7).toBase58()).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/);
    expect(deriveVaultAuthorityPda("match_1").toBase58()).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/);
    expect(deriveAssociatedTokenAddress(user, mint).toBase58()).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/);
  });

  it("encodes place_bet instruction data with Anchor discriminator and borsh args", () => {
    const data = encodePlaceBetData({
      direction: 0,
      windowSecs: 60,
      amount: 100_000_000n,
      nonce: 42,
    });

    expect([...data.subarray(0, 8)]).toEqual([222, 62, 67, 220, 63, 166, 126, 33]);
    expect(data.readUInt8(8)).toBe(0);
    expect(data.readUInt32LE(9)).toBe(60);
    expect(data.readBigUInt64LE(13)).toBe(100_000_000n);
    expect(data.readUInt32LE(21)).toBe(42);
  });

  it("encodes settle_bet instruction data with Anchor discriminator and odds", () => {
    const data = encodeSettleBetData(6700);

    expect([...data.subarray(0, 8)]).toEqual([115, 55, 234, 177, 227, 4, 10, 67]);
    expect(data.readUInt16LE(8)).toBe(6700);
  });

  it("builds phase 1 instructions for the betting engine", () => {
    const user = new PublicKey("He5N26TPqsKvbG1UJgj5QgVrEroz4hMjPdytMvx677AA");
    const mint = new PublicKey("So11111111111111111111111111111111111111112");

    const place = buildPlaceBetInstruction(user, "match_1", mint, {
      direction: 1,
      windowSecs: 300,
      amount: 50_000_000n,
      nonce: 3,
    });
    const settle = buildSettleBetInstruction(user, user, "match_1", mint, 3, 6300);

    expect(place.programId.equals(BETTING_ENGINE_PROGRAM_ID)).toBe(true);
    expect(place.keys).toHaveLength(10);
    expect(settle.programId.equals(BETTING_ENGINE_PROGRAM_ID)).toBe(true);
    expect(settle.keys).toHaveLength(7);
  });

  it("builds an associated token account creation instruction for the wallet", () => {
    const payer = new PublicKey("He5N26TPqsKvbG1UJgj5QgVrEroz4hMjPdytMvx677AA");
    const mint = new PublicKey("So11111111111111111111111111111111111111112");
    const ata = deriveAssociatedTokenAddress(payer, mint);

    const instruction = buildCreateAssociatedTokenAccountInstruction(payer, payer, mint);

    expect(instruction.programId.toBase58()).toBe("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
    expect(instruction.keys.map((key) => key.pubkey.toBase58())).toEqual([
      payer.toBase58(),
      ata.toBase58(),
      payer.toBase58(),
      mint.toBase58(),
      "11111111111111111111111111111111",
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    ]);
  });

  it("builds stable filters for wallet bet listing", () => {
    const user = new PublicKey("He5N26TPqsKvbG1UJgj5QgVrEroz4hMjPdytMvx677AA");

    expect(buildUserBetFilters(user)).toEqual([
      { dataSize: 157 },
      { memcmp: { offset: 8, bytes: user.toBase58() } },
    ]);
  });

  it("documents match account size for frontend listing", () => {
    expect(MATCH_ACCOUNT_SIZE).toBe(95);
  });

  it("builds stable filters for match listing", () => {
    expect(buildMatchAccountFilters()).toEqual([{ dataSize: 95 }]);
  });

  it("formats 6-decimal token balances for compact UI display", () => {
    expect(formatTokenUnits(0n)).toBe("0");
    expect(formatTokenUnits(1_000_000n)).toBe("1");
    expect(formatTokenUnits(1_250_000n)).toBe("1.25");
    expect(formatTokenUnits(123_456_789n)).toBe("123.456789");
  });

  it("converts test USDC values to 6-decimal token units", () => {
    expect(usdcToUnits("1")).toBe(1_000_000n);
    expect(usdcToUnits("0.5")).toBe(500_000n);
    expect(usdcToUnits("100.123456")).toBe(100_123_456n);
    expect(() => usdcToUnits("1.1234567")).toThrow("Use ate 6 casas decimais.");
  });
});

const PUBLIC_PROGRAM_ID = "6BVWCCQDjQDcjQYhmbzJ9DFWY9LyDojM3mYoWivrASaG";
