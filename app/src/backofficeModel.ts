export type Direction = 0 | 1;

export type ReadinessInput = {
  backendReachable: boolean | null;
  walletConnected: boolean;
  selectedMatchLoaded: boolean;
  walletBalance: bigint | null;
  backendErrors: number;
};

export type ReadinessSummary = {
  level: "ready" | "warning" | "blocked";
  label: string;
  detail: string;
};

export type GameBackendMatch = {
  id: string;
  odds: {
    home: number;
    away: number;
    draw: number;
  };
  updatedAt?: string;
};

export type GameOnChainMatch = {
  pda: string;
  matchId: string;
  oddsHome: number;
  oddsAway: number;
  oddsDraw: number;
  updatedAt: bigint;
};

export type GameBet = {
  matchId: string;
  amount: bigint;
  status: number;
};

export type GameRow = {
  matchId: string;
  pda: string | null;
  oddsHome: number;
  oddsAway: number;
  oddsDraw: number;
  updatedAt: bigint | null;
  backendUpdatedAt: string | null;
  totalStaked: bigint;
  openBets: number;
  source: "backend" | "chain" | "backend+chain";
};

export type BackendErrorInput = {
  at?: string;
  message: string;
};

export type BackendTxInput = Record<string, unknown>;

export type RealtimeEventInput = {
  at: string;
  matchId: string | null;
  label: string;
  detail: string;
};

export type GameEvent = {
  id: string;
  at: string;
  matchId: string | null;
  label: string;
  detail: string;
  tone: "good" | "bad" | "idle";
};

export type OddsChartSegment = {
  key: "home" | "away" | "draw";
  label: string;
  value: number;
  width: string;
};

export type TradingChartSeries = {
  key: "home" | "away" | "draw";
  label: string;
  value: number;
  displayValue: string;
  points: string;
};

export type CurrentOddsBar = {
  key: "home" | "away" | "draw";
  label: string;
  value: number;
  displayValue: string;
  width: string;
};

export type CreateGameFormInput = {
  matchId: string;
  home: string;
  away: string;
  draw: string;
};

export type CreateGameFormResult =
  | { ok: true; matchId: string; odds: { home: number; away: number; draw: number } }
  | { ok: false; error: string };

export function buildGameRows(input: {
  backendMatches: GameBackendMatch[];
  onChainMatches: GameOnChainMatch[];
  bets: GameBet[];
}): GameRow[] {
  const backendById = new Map(input.backendMatches.map((match) => [match.id, match]));
  const chainById = new Map(input.onChainMatches.map((match) => [match.matchId, match]));
  const ids = Array.from(new Set([...backendById.keys(), ...chainById.keys()])).sort();

  return ids.map((matchId) => {
    const backend = backendById.get(matchId);
    const chain = chainById.get(matchId);
    const matchBets = input.bets.filter((bet) => bet.matchId === matchId);
    const totalStaked = matchBets.reduce((total, bet) => total + bet.amount, 0n);
    const openBets = matchBets.filter((bet) => bet.status === 0).length;

    return {
      matchId,
      pda: chain?.pda ?? null,
      oddsHome: chain?.oddsHome ?? backend?.odds.home ?? 0,
      oddsAway: chain?.oddsAway ?? backend?.odds.away ?? 0,
      oddsDraw: chain?.oddsDraw ?? backend?.odds.draw ?? 0,
      updatedAt: chain?.updatedAt ?? null,
      backendUpdatedAt: backend?.updatedAt ?? null,
      totalStaked,
      openBets,
      source: chain && backend ? "backend+chain" : chain ? "chain" : "backend",
    };
  });
}

export function findGameRow(rows: GameRow[], matchId: string | null): GameRow | null {
  if (!matchId) return null;
  return rows.find((row) => row.matchId === matchId) ?? null;
}

export function buildGameEvents(input: {
  backendErrors?: BackendErrorInput[];
  backendTxs?: BackendTxInput[];
  realtimeEvents?: RealtimeEventInput[];
}): GameEvent[] {
  const errors = (input.backendErrors ?? []).map<GameEvent>((error, index) => ({
    id: `error-${index}`,
    at: error.at ?? new Date(0).toISOString(),
    matchId: null,
    label: "Erro backend",
    detail: error.message,
    tone: "bad",
  }));

  const txs = (input.backendTxs ?? []).map<GameEvent>((tx, index) => ({
    id: `tx-${index}`,
    at: stringField(tx.at) ?? stringField(tx.updatedAt) ?? new Date(0).toISOString(),
    matchId: stringField(tx.matchId),
    label: "Transacao",
    detail: stringField(tx.signature) ?? stringField(tx.tx) ?? "Backend transaction",
    tone: "idle",
  }));

  const realtime = (input.realtimeEvents ?? []).map<GameEvent>((event, index) => ({
    id: `realtime-${index}`,
    at: event.at,
    matchId: event.matchId,
    label: event.label,
    detail: event.detail,
    tone: "good",
  }));

  return [...errors, ...txs, ...realtime].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

export function directionLabel(direction: Direction): string {
  return direction === 0 ? "UP" : "DOWN";
}

export function betStatusLabel(status: number): string {
  if (status === 0) return "Open";
  if (status === 1) return "Won";
  if (status === 2) return "Lost";
  if (status === 3) return "Cancelled";
  return `Unknown ${status}`;
}

export function shortenAddress(value: string, edge = 4): string {
  if (value.length <= edge * 2 + 3) {
    return value;
  }

  return `${value.slice(0, edge)}...${value.slice(-edge)}`;
}

export function formatPercentOdds(value: number): string {
  return `${(value / 100).toFixed(2)}%`;
}

export function oddsChartSegments(odds: { home: number; away: number; draw: number }): OddsChartSegment[] {
  return [
    { key: "home", label: "Casa", value: odds.home, width: formatPercentOdds(odds.home) },
    { key: "away", label: "Fora", value: odds.away, width: formatPercentOdds(odds.away) },
    { key: "draw", label: "Empate", value: odds.draw, width: formatPercentOdds(odds.draw) },
  ];
}

export function currentOddsBars(odds: { home: number; away: number; draw: number }): CurrentOddsBar[] {
  return oddsChartSegments(odds).map((segment) => ({
    key: segment.key,
    label: segment.label,
    value: segment.value,
    displayValue: formatPercentOdds(segment.value),
    width: segment.width,
  }));
}

export function parseCreateGameForm(input: CreateGameFormInput): CreateGameFormResult {
  const matchId = input.matchId.trim();
  if (!matchId) {
    return { ok: false, error: "Informe o ID do jogo." };
  }

  const home = parseBasisPoints(input.home);
  const away = parseBasisPoints(input.away);
  const draw = parseBasisPoints(input.draw);
  if (home === null || away === null || draw === null) {
    return { ok: false, error: "Use numeros inteiros entre 0 e 10000." };
  }

  if (home + away + draw !== 10_000) {
    return { ok: false, error: "As odds precisam somar 10000." };
  }

  return { ok: true, matchId, odds: { home, away, draw } };
}

export function tradingChartSeries(odds: { home: number; away: number; draw: number }): TradingChartSeries[] {
  return [
    { key: "home", label: "Casa", value: odds.home, displayValue: formatPercentOdds(odds.home), points: tradingPoints(odds.home, [18, 12, 14, 4, 8, -3]) },
    { key: "away", label: "Fora", value: odds.away, displayValue: formatPercentOdds(odds.away), points: tradingPoints(odds.away, [8, 4, 6, -2, 2, -7]) },
    { key: "draw", label: "Empate", value: odds.draw, displayValue: formatPercentOdds(odds.draw), points: tradingPoints(odds.draw, [1, 0, 1, -3, -1, -6]) },
  ];
}

export function formatTokenUnits(amount: bigint | null): string {
  if (amount === null) {
    return "missing";
  }

  const whole = amount / 1_000_000n;
  const fraction = amount % 1_000_000n;
  if (fraction === 0n) {
    return whole.toString();
  }

  return `${whole}.${fraction.toString().padStart(6, "0").replace(/0+$/, "")}`;
}

export function usdcToUnits(value: string): bigint {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{0,6})?$/.test(trimmed)) {
    throw new Error("Use up to 6 decimals.");
  }

  const [whole, fraction = ""] = trimmed.split(".");
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
}

export function formatUnixTime(value: bigint | number | null): string {
  if (value === null) {
    return "not set";
  }

  const seconds = typeof value === "bigint" ? Number(value) : value;
  return new Date(seconds * 1000).toLocaleString();
}

export function readinessSummary(input: ReadinessInput): ReadinessSummary {
  if (input.backendReachable === false) {
    return {
      level: "blocked",
      label: "Backend offline",
      detail: "Start backend on port 8787 or update the backend URL.",
    };
  }

  if (!input.walletConnected) {
    return {
      level: "blocked",
      label: "Wallet needed",
      detail: "Connect Phantom or Solflare on testnet.",
    };
  }

  if (!input.selectedMatchLoaded) {
    return {
      level: "warning",
      label: "Load match",
      detail: "Select a match or fetch the configured match PDA.",
    };
  }

  if (input.walletBalance === null || input.walletBalance < 1_000_000n) {
    return {
      level: "warning",
      label: "Fund wallet",
      detail: "Create the wallet token account and mint test USDC if needed.",
    };
  }

  if (input.backendErrors > 0) {
    return {
      level: "warning",
      label: "Backend warnings",
      detail: "Recent backend errors need inspection.",
    };
  }

  return {
    level: "ready",
    label: "Ready",
    detail: "Backend, wallet, match, and token balance are available.",
  };
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function tradingPoints(value: number, offsets: number[]): string {
  const baseY = 60 - Math.round((value / 10_000) * 48);
  return offsets.map((offset, index) => `${index * 24},${Math.max(8, Math.min(60, baseY + offset))}`).join(" ");
}

function parseBasisPoints(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10_000) return null;
  return parsed;
}
