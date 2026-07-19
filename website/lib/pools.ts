/**
 * Mock data layer for the investor panel.
 *
 * Shapes mirror the on-chain schemas of the `liquidity-pool` program
 * (docs/fase-2a-pool-deposit.md) so swapping mocks for real reads is a
 * drop-in change:
 *
 *   Pool       { match_id, total_liquidity, locked_liquidity, fee_rate, total_shares }
 *   LpPosition { pool, shares, deposited_at }
 *
 * Amounts are in USDC (display units, 2dp). fee_rate is in bps (200 = 2.00%).
 * Share math is the program's: first deposit 1:1, then
 * shares = amount * total_shares / total_liquidity.
 */

export type PoolStatus = "live" | "open" | "settled";

export type Pool = {
  matchId: string;
  home: string;
  away: string;
  kickoff: string; // display only
  status: PoolStatus;
  totalLiquidity: number;
  lockedLiquidity: number;
  feeRateBps: number; // 200 = 2.00%
  totalShares: number;
  exposureUp: number; // USDC backing UP bets
  exposureDown: number; // USDC backing DOWN bets
  feesAccruedLp: number; // lifetime LP fees, USDC
};

export type LpPosition = {
  matchId: string;
  shares: number;
  depositedUsdc: number; // cost basis, for PnL display
  claimableFees: number;
};

export const MOCK_POOLS: Pool[] = [
  {
    matchId: "wc26-bra-arg",
    home: "BRA",
    away: "ARG",
    kickoff: "Live · 63'",
    status: "live",
    totalLiquidity: 182_450.0,
    lockedLiquidity: 121_300.0,
    feeRateBps: 200,
    totalShares: 175_000.0,
    exposureUp: 74_800.0,
    exposureDown: 46_500.0,
    feesAccruedLp: 2_184.5,
  },
  {
    matchId: "wc26-fra-eng",
    home: "FRA",
    away: "ENG",
    kickoff: "Live · 12'",
    status: "live",
    totalLiquidity: 96_200.0,
    lockedLiquidity: 31_750.0,
    feeRateBps: 200,
    totalShares: 96_200.0,
    exposureUp: 12_400.0,
    exposureDown: 19_350.0,
    feesAccruedLp: 412.75,
  },
  {
    matchId: "wc26-ger-esp",
    home: "GER",
    away: "ESP",
    kickoff: "Today 21:00",
    status: "open",
    totalLiquidity: 54_000.0,
    lockedLiquidity: 0,
    feeRateBps: 200,
    totalShares: 54_000.0,
    exposureUp: 0,
    exposureDown: 0,
    feesAccruedLp: 0,
  },
  {
    matchId: "wc26-por-ned",
    home: "POR",
    away: "NED",
    kickoff: "Tomorrow 17:00",
    status: "open",
    totalLiquidity: 12_500.0,
    lockedLiquidity: 0,
    feeRateBps: 200,
    totalShares: 12_500.0,
    exposureUp: 0,
    exposureDown: 0,
    feesAccruedLp: 0,
  },
  {
    matchId: "wc26-ita-usa",
    home: "ITA",
    away: "USA",
    kickoff: "Settled",
    status: "settled",
    totalLiquidity: 148_900.0,
    lockedLiquidity: 0,
    feeRateBps: 200,
    totalShares: 141_000.0,
    exposureUp: 0,
    exposureDown: 0,
    feesAccruedLp: 3_961.2,
  },
];

export const MOCK_POSITIONS: LpPosition[] = [
  {
    matchId: "wc26-bra-arg",
    shares: 5_000,
    depositedUsdc: 5_000,
    claimableFees: 62.41,
  },
  {
    matchId: "wc26-ita-usa",
    shares: 2_000,
    depositedUsdc: 2_000,
    claimableFees: 56.19,
  },
];

/** shares minted for a deposit — program rule (1:1 on empty pool) */
export function sharesForDeposit(pool: Pool, amount: number): number {
  if (pool.totalShares === 0 || pool.totalLiquidity === 0) return amount;
  return (amount * pool.totalShares) / pool.totalLiquidity;
}

/** current USDC value of a shares position */
export function positionValue(pool: Pool, shares: number): number {
  if (pool.totalShares === 0) return 0;
  return (shares * pool.totalLiquidity) / pool.totalShares;
}

/** USDC per share */
export function sharePrice(pool: Pool): number {
  if (pool.totalShares === 0) return 1;
  return pool.totalLiquidity / pool.totalShares;
}

/** unlocked fraction of the pool — withdrawals are capped to it */
export function unlockedRatio(pool: Pool): number {
  if (pool.totalLiquidity === 0) return 1;
  return 1 - pool.lockedLiquidity / pool.totalLiquidity;
}

export function formatUsdc(v: number): string {
  if (v >= 100_000) {
    return `${(v / 1_000).toFixed(1)}k`;
  }
  return v.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
