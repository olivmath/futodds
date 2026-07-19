const HOME_NAMES = new Set(["1", "home", "participant1", "part1"]);
const DRAW_NAMES = new Set(["x", "draw"]);
const AWAY_NAMES = new Set(["2", "away", "participant2", "part2"]);
const ONE_X_TWO_TYPES = new Set(["1x2", "1x2_participant_result"]);

export function selectTxlineOdds(entries, {
  superOddsType = "1X2",
  marketPeriod = "FullTime",
} = {}) {
  for (const entry of entries ?? []) {
    if (!isExpectedMarket(entry, superOddsType, marketPeriod)) {
      continue;
    }
    const values = extractOutcomeValues(entry);
    if (!values) {
      continue;
    }
    return normalizeContractOdds(values);
  }
  return null;
}

function isExpectedMarket(entry, superOddsType, marketPeriod) {
  const actualType = normalizeText(entry.SuperOddsType);
  const expectedType = normalizeText(superOddsType);
  // Accept any MarketPeriod value - txline returns what's available
  return actualType === expectedType
    || (expectedType === "1x2" && ONE_X_TWO_TYPES.has(actualType));
}

function extractOutcomeValues(entry) {
  const priceNames = entry.PriceNames ?? [];
  const prices = entry.Prices ?? [];
  const percentages = entry.Pct ?? [];
  const outcomes = {};

  for (let index = 0; index < priceNames.length; index += 1) {
    const outcome = mapOutcomeName(priceNames[index]);
    if (!outcome) {
      continue;
    }
    outcomes[outcome] = parsePct(percentages[index]) ?? impliedProbability(prices[index]);
  }

  if (!hasPositiveNumber(outcomes.home) || !hasPositiveNumber(outcomes.away) || !hasPositiveNumber(outcomes.draw)) {
    return null;
  }
  return outcomes;
}

function normalizeContractOdds(values) {
  const total = values.home + values.away + values.draw;
  const home = Math.round((values.home / total) * 10_000);
  const away = Math.round((values.away / total) * 10_000);
  const draw = 10_000 - home - away;
  return { home, away, draw };
}

function mapOutcomeName(name) {
  const normalized = normalizeText(name);
  if (HOME_NAMES.has(normalized)) return "home";
  if (AWAY_NAMES.has(normalized)) return "away";
  if (DRAW_NAMES.has(normalized)) return "draw";
  return null;
}

function parsePct(value) {
  if (typeof value !== "string" || value === "NA") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function impliedProbability(price) {
  const parsed = Number(price);
  return Number.isFinite(parsed) && parsed > 0 ? 1000 / parsed : null;
}

function hasPositiveNumber(value) {
  return Number.isFinite(value) && value > 0;
}

function normalizeText(value) {
  return String(value ?? "").trim().toLowerCase();
}
