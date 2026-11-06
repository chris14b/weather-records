import type { CandidateFact } from "../src/pipeline/candidates.ts";

/** A record-setting hottest day among 50,000 days since 1900, changed by `fact`. */
export function dailyFact(fact: Partial<CandidateFact> = {}): CandidateFact {
  return {
    locationId: "test",
    date: "2026-11-06",
    from: fact.date ?? "2026-11-06",
    period: { kind: "day" },
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

/** The wettest October on record among 160 since 1866, changed by `fact`. */
export function periodFact(fact: Partial<CandidateFact> = {}): CandidateFact {
  return dailyFact({
    date: "2026-10-31",
    from: "2026-10-01",
    period: { kind: "month", toDate: false },
    measure: "rain",
    value: 400,
    comparison: "month",
    compared: 160,
    recordStart: "1866-01-01",
    ...fact,
  });
}
