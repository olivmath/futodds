/**
 * Data layer for the investor panel.
 *
 * Reads come from the backend (`GET /pools`, `GET /pools/positions/:owner`),
 * which decodes the on-chain accounts of the betting-engine program:
 *
 *   Pool       { match_id, total_liquidity, locked_liquidity, fee_rate,
 *                protocol_fees_accumulated, lp_fees_accumulated, total_shares }
 *   LpPosition { pool, shares, deposited_at, pending fees }
 *
 * Amounts are u64 base units of the pool mint (USDC, 6 decimals) and are
 * kept as bigint so share math mirrors the program exactly.
 */

export type PoolStatus = "live" | "open" | "settled";

export type Pool = {
  pubkey: string;
  matchId: string;
  tag: string;
  status: PoolStatus;
  mint: string;
  vault: string;
  totalLiquidity: bigint;
  lockedLiquidity: bigint;
  totalShares: bigint;
  feeRateBps: number; // 200 = 2.00%
  protocolFeesAccumulated: bigint;
  lpFeesAccumulated: bigint;
};

export type LpPosition = {
  pool: string;
  matchId: string | null;
  shares: bigint;
  depositedAt: number;
  pendingFees: bigint;
};

export type PoolsMeta = {
  programId: string;
  rpcUrl: string;
  mint: string;
};

export const USDC_DECIMALS = 6;
const USDC_UNIT = 1_000_000;

export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8787";

type RawPool = {
  pubkey: string;
  matchId: string;
  tag?: string;
  status?: string;
  mint: string;
  vault: string;
  totalLiquidity: string;
  lockedLiquidity: string;
  totalShares: string;
  feeRate: number;
  protocolFeesAccumulated: string;
  lpFeesAccumulated: string;
};

type RawPosition = {
  pool: string;
  matchId: string | null;
  shares: string;
  depositedAt: number;
  pendingFees: string;
};

export async function fetchPools(): Promise<{ meta: PoolsMeta; pools: Pool[] }> {
  const response = await fetch(`${BACKEND_URL}/pools`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`GET /pools failed: ${response.status}`);
  }
  const body = (await response.json()) as PoolsMeta & { pools: RawPool[] };
  return {
    meta: { programId: body.programId, rpcUrl: body.rpcUrl, mint: body.mint },
    pools: body.pools.map((raw) => ({
      pubkey: raw.pubkey,
      matchId: raw.matchId,
      tag: raw.tag ?? "",
      status: (raw.status ?? "settled") as PoolStatus,
      mint: raw.mint,
      vault: raw.vault,
      totalLiquidity: BigInt(raw.totalLiquidity),
      lockedLiquidity: BigInt(raw.lockedLiquidity),
      totalShares: BigInt(raw.totalShares),
      feeRateBps: raw.feeRate,
      protocolFeesAccumulated: BigInt(raw.protocolFeesAccumulated),
      lpFeesAccumulated: BigInt(raw.lpFeesAccumulated),
    })),
  };
}

export async function fetchPositions(owner: string): Promise<LpPosition[]> {
  const response = await fetch(`${BACKEND_URL}/pools/positions/${owner}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`GET /pools/positions failed: ${response.status}`);
  }
  const body = (await response.json()) as RawPosition[];
  return body.map((raw) => ({
    pool: raw.pool,
    matchId: raw.matchId,
    shares: BigInt(raw.shares),
    depositedAt: raw.depositedAt,
    pendingFees: BigInt(raw.pendingFees),
  }));
}

/** LP principal backing shares — fees are tracked separately by the program */
export function principalLiquidity(pool: Pool): bigint {
  return pool.totalLiquidity - pool.protocolFeesAccumulated - pool.lpFeesAccumulated;
}

/** shares minted for a deposit — program rule (1:1 on empty pool) */
export function sharesForDeposit(pool: Pool, amount: bigint): bigint {
  if (pool.totalShares === 0n || pool.totalLiquidity === 0n) return amount;
  return (amount * pool.totalShares) / pool.totalLiquidity;
}

/** current USDC value of a shares position — the program's withdraw math */
export function positionValue(pool: Pool, shares: bigint): bigint {
  if (pool.totalShares === 0n) return 0n;
  return (shares * principalLiquidity(pool)) / pool.totalShares;
}

/** shares to burn so withdraw pays out `amount` of principal */
export function sharesForWithdrawAmount(pool: Pool, amount: bigint): bigint {
  const principal = principalLiquidity(pool);
  if (principal === 0n) return 0n;
  return (amount * pool.totalShares) / principal;
}

/** USDC principal per share */
export function sharePrice(pool: Pool): number {
  if (pool.totalShares === 0n) return 1;
  return toUsdc(principalLiquidity(pool)) / toUsdc(pool.totalShares);
}

/** unlocked fraction of the pool — withdrawals are capped to it */
export function unlockedRatio(pool: Pool): number {
  if (pool.totalLiquidity === 0n) return 1;
  return 1 - toUsdc(pool.lockedLiquidity) / toUsdc(pool.totalLiquidity);
}

/** liquidity not backing open bets — the program's withdraw cap */
export function availableLiquidity(pool: Pool): bigint {
  return pool.totalLiquidity - pool.lockedLiquidity;
}

export function toUsdc(value: bigint): number {
  return Number(value) / USDC_UNIT;
}

export function fromUsdc(value: number): bigint {
  return BigInt(Math.round(value * USDC_UNIT));
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

export function clusterLabel(rpcUrl: string | undefined): string {
  if (!rpcUrl) return "";
  if (rpcUrl.includes("testnet")) return "Testnet";
  if (rpcUrl.includes("devnet")) return "Devnet";
  if (rpcUrl.includes("mainnet")) return "Mainnet";
  if (rpcUrl.includes("localhost") || rpcUrl.includes("127.0.0.1")) return "Localnet";
  return "Custom RPC";
}
