import assert from "node:assert/strict";
import test from "node:test";
import { selectTxlineOdds } from "../src/txlineOdds.js";

test("selectTxlineOdds maps TxLINE 1X2 percentages into normalized contract odds", () => {
  const odds = selectTxlineOdds([
    {
      FixtureId: 17588229,
      SuperOddsType: "1X2",
      MarketPeriod: "FullTime",
      PriceNames: ["1", "X", "2"],
      Prices: [2200, 3100, 3400],
      Pct: ["46.000", "29.000", "25.000"],
    },
  ]);

  assert.deepEqual(odds, { home: 4600, away: 2500, draw: 2900 });
});

test("selectTxlineOdds derives implied probabilities from prices when Pct is unavailable", () => {
  const odds = selectTxlineOdds([
    {
      FixtureId: 17588231,
      SuperOddsType: "1X2",
      MarketPeriod: "FullTime",
      PriceNames: ["Home", "Draw", "Away"],
      Prices: [2000, 4000, 4000],
      Pct: ["NA", "NA", "NA"],
    },
  ]);

  assert.deepEqual(odds, { home: 5000, away: 2500, draw: 2500 });
});

test("selectTxlineOdds skips non-1X2 markets and rejects missing home draw away prices", () => {
  assert.deepEqual(
    selectTxlineOdds([
      {
        FixtureId: 17588231,
        SuperOddsType: "Total Goals",
        MarketPeriod: "FullTime",
        PriceNames: ["Over", "Under"],
        Prices: [1900, 1900],
        Pct: ["50.000", "50.000"],
      },
      {
        FixtureId: 17588231,
        SuperOddsType: "1X2",
        MarketPeriod: "FirstHalf",
        PriceNames: ["1", "X", "2"],
        Prices: [2000, 3500, 4000],
        Pct: ["50.000", "28.000", "22.000"],
      },
    ]),
    null,
  );
});

test("selectTxlineOdds keeps normalized odds summing to 10000 after rounding", () => {
  const odds = selectTxlineOdds([
    {
      FixtureId: 17588229,
      SuperOddsType: "1X2",
      MarketPeriod: "FullTime",
      PriceNames: ["1", "X", "2"],
      Prices: [0, 0, 0],
      Pct: ["33.333", "33.333", "33.334"],
    },
  ]);

  assert.equal(odds.home + odds.away + odds.draw, 10_000);
});
