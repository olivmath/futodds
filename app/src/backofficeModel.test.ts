import { describe, expect, it } from "vitest";
import {
  betStatusLabel,
  buildGameEvents,
  buildGameRows,
  directionLabel,
  findGameRow,
  formatPercentOdds,
  formatTokenUnits,
  formatUnixTime,
  currentOddsBars,
  oddsChartSegments,
  parseCreateGameForm,
  readinessSummary,
  shortenAddress,
  tradingChartSeries,
  usdcToUnits,
} from "./backofficeModel";

describe("backoffice model", () => {
  it("formats operational labels and compact values", () => {
    expect(directionLabel(0)).toBe("UP");
    expect(directionLabel(1)).toBe("DOWN");
    expect(betStatusLabel(0)).toBe("Open");
    expect(betStatusLabel(1)).toBe("Won");
    expect(betStatusLabel(2)).toBe("Lost");
    expect(betStatusLabel(3)).toBe("Cancelled");
    expect(betStatusLabel(9)).toBe("Unknown 9");
    expect(shortenAddress("GoccKzkMS5BWRmrbLdGKzqKUUcksZB3DftW82F7boCoQ")).toBe("Gocc...oCoQ");
  });

  it("builds game rows with backend, on-chain and staked totals", () => {
    const rows = buildGameRows({
      backendMatches: [
        { id: "match_1", odds: { home: 6500, away: 3000, draw: 500 }, updatedAt: "2026-07-19T12:00:00.000Z" },
        { id: "match_2", odds: { home: 5200, away: 4100, draw: 700 } },
      ],
      onChainMatches: [
        {
          pda: "matchPda1",
          matchId: "match_1",
          oddsHome: 6600,
          oddsAway: 2900,
          oddsDraw: 500,
          updatedAt: 1_700_000_000n,
        },
      ],
      bets: [
        { matchId: "match_1", amount: 1_000_000n, status: 0 },
        { matchId: "match_1", amount: 2_500_000n, status: 1 },
        { matchId: "match_2", amount: 3_000_000n, status: 0 },
      ],
    });

    expect(rows).toEqual([
      {
        matchId: "match_1",
        pda: "matchPda1",
        oddsHome: 6600,
        oddsAway: 2900,
        oddsDraw: 500,
        updatedAt: 1_700_000_000n,
        backendUpdatedAt: "2026-07-19T12:00:00.000Z",
        totalStaked: 3_500_000n,
        openBets: 1,
        source: "backend+chain",
      },
      {
        matchId: "match_2",
        pda: null,
        oddsHome: 5200,
        oddsAway: 4100,
        oddsDraw: 700,
        updatedAt: null,
        backendUpdatedAt: null,
        totalStaked: 3_000_000n,
        openBets: 1,
        source: "backend",
      },
    ]);
  });

  it("formats odds and token values for dashboard cards", () => {
    expect(formatPercentOdds(6500)).toBe("65.00%");
    expect(formatPercentOdds(625)).toBe("6.25%");
    expect(formatTokenUnits(null)).toBe("missing");
    expect(formatTokenUnits(0n)).toBe("0");
    expect(formatTokenUnits(1_250_000n)).toBe("1.25");
    expect(usdcToUnits("100.123456")).toBe(100_123_456n);
    expect(() => usdcToUnits("1.1234567")).toThrow("Use up to 6 decimals.");
  });

  it("parses create game form odds in basis points", () => {
    expect(parseCreateGameForm({ matchId: "match_3", home: "9000", away: "500", draw: "500" })).toEqual({
      ok: true,
      matchId: "match_3",
      odds: { home: 9000, away: 500, draw: 500 },
    });
  });

  it("rejects create game form values with invalid odds", () => {
    expect(parseCreateGameForm({ matchId: " ", home: "9000", away: "500", draw: "500" })).toEqual({
      ok: false,
      error: "Informe o ID do jogo.",
    });
    expect(parseCreateGameForm({ matchId: "match_3", home: "9000", away: "500", draw: "600" })).toEqual({
      ok: false,
      error: "As odds precisam somar 10000.",
    });
    expect(parseCreateGameForm({ matchId: "match_3", home: "abc", away: "500", draw: "500" })).toEqual({
      ok: false,
      error: "Use numeros inteiros entre 0 e 10000.",
    });
  });

  it("builds odds chart segments for the match table", () => {
    expect(oddsChartSegments({ home: 6500, away: 3000, draw: 500 })).toEqual([
      { key: "home", label: "Casa", value: 6500, width: "65.00%" },
      { key: "away", label: "Fora", value: 3000, width: "30.00%" },
      { key: "draw", label: "Empate", value: 500, width: "5.00%" },
    ]);
  });

  it("builds compact current odds bars for table cells", () => {
    expect(currentOddsBars({ home: 9000, away: 500, draw: 500 })).toEqual([
      { key: "home", label: "Casa", value: 9000, displayValue: "90.00%", width: "90.00%" },
      { key: "away", label: "Fora", value: 500, displayValue: "5.00%", width: "5.00%" },
      { key: "draw", label: "Empate", value: 500, displayValue: "5.00%", width: "5.00%" },
    ]);
  });

  it("builds trading chart series from current odds", () => {
    expect(tradingChartSeries({ home: 6500, away: 3000, draw: 500 })).toEqual([
      {
        key: "home",
        label: "Casa",
        value: 6500,
        displayValue: "65.00%",
        points: "0,47 24,41 48,43 72,33 96,37 120,26",
      },
      {
        key: "away",
        label: "Fora",
        value: 3000,
        displayValue: "30.00%",
        points: "0,54 24,50 48,52 72,44 96,48 120,39",
      },
      {
        key: "draw",
        label: "Empate",
        value: 500,
        displayValue: "5.00%",
        points: "0,59 24,58 48,59 72,55 96,57 120,52",
      },
    ]);
  });

  it("finds the selected game row by match id", () => {
    const rows = buildGameRows({
      backendMatches: [{ id: "match_2", odds: { home: 5200, away: 4100, draw: 700 } }],
      onChainMatches: [],
      bets: [],
    });

    expect(findGameRow(rows, "match_2")?.matchId).toBe("match_2");
    expect(findGameRow(rows, "missing")).toBeNull();
    expect(findGameRow(rows, null)).toBeNull();
  });

  it("builds newest-first game events from backend errors, txs and realtime logs", () => {
    const events = buildGameEvents({
      backendErrors: [{ at: "2026-07-19T12:01:00.000Z", message: "poller failed" }],
      backendTxs: [{ at: "2026-07-19T12:02:00.000Z", matchId: "match_1", signature: "abc123" }],
      realtimeEvents: [
        {
          at: "2026-07-19T12:03:00.000Z",
          matchId: "match_2",
          label: "OddsUpdated",
          detail: "Casa 65.00%",
        },
      ],
    });

    expect(events).toEqual([
      {
        id: "realtime-0",
        at: "2026-07-19T12:03:00.000Z",
        matchId: "match_2",
        label: "OddsUpdated",
        detail: "Casa 65.00%",
        tone: "good",
      },
      {
        id: "tx-0",
        at: "2026-07-19T12:02:00.000Z",
        matchId: "match_1",
        label: "Transacao",
        detail: "abc123",
        tone: "idle",
      },
      {
        id: "error-0",
        at: "2026-07-19T12:01:00.000Z",
        matchId: null,
        label: "Erro backend",
        detail: "poller failed",
        tone: "bad",
      },
    ]);
  });

  it("summarizes dashboard readiness by the first blocking condition", () => {
    expect(
      readinessSummary({
        backendReachable: true,
        walletConnected: true,
        selectedMatchLoaded: true,
        walletBalance: 5_000_000n,
        backendErrors: 0,
      }),
    ).toEqual({
      level: "ready",
      label: "Ready",
      detail: "Backend, wallet, match, and token balance are available.",
    });

    expect(
      readinessSummary({
        backendReachable: false,
        walletConnected: true,
        selectedMatchLoaded: true,
        walletBalance: 5_000_000n,
        backendErrors: 0,
      }).label,
    ).toBe("Backend offline");
  });

  it("formats unix timestamps and empty values safely", () => {
    expect(formatUnixTime(null)).toBe("not set");
    expect(formatUnixTime(1_700_000_000)).toMatch(/2023|2024/);
    expect(formatUnixTime(1_700_000_000n)).toMatch(/2023|2024/);
  });
});
