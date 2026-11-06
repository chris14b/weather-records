import type { DailyFact } from "../src/pipeline/daily-facts.ts";

/** A record-setting hottest day among 50,000 days since 1900, changed by `fact`. */
export function dailyFact(fact: Partial<DailyFact> = {}): DailyFact {
  return {
    locationId: "test",
    date: "2026-11-06",
    measure: "maxTemp",
    direction: "highest",
    value: 40,
    status: "confirmed",
    comparison: "all",
    rank: 1,
    ties: 0,
    compared: 50_000,
    recordStart: "1900-01-01",
    fullRecord: true,
    missingDays: 0,
    gaps: [],
    since: null,
    comparedSince: fact.compared ?? 50_000,
    beatenBy: null,
    ...fact,
  };
}
