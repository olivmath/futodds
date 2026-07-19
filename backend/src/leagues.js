import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH = path.join(__dirname, "..", "SoccerSupportedLeagues.csv");

let cached = null;

export function loadLeagues() {
  if (cached) return cached;
  const raw = fs.readFileSync(CSV_PATH, "utf8");
  const lines = raw.trim().split("\n").slice(1);
  cached = lines.map((line) => {
    const [country, competition, competitionId] = line.split(",");
    return { country, competition, competitionId: Number(competitionId) };
  });
  return cached;
}
