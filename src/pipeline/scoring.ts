import type { Comparison, FactMeasure, Lead } from "../shared/facts.ts";
import type { CandidateFact } from "./candidates.ts";
import { daysBetween } from "./dates.ts";

export interface ScoredFact {
  fact: CandidateFact;
  score: number;
  lead: Lead;
}

/** The lowest rank worth saying, counting the days it ties with. */
const lowestRank = 10;

/** Records shorter than this make ranks easier to reach, so their ranks score less. */
const fullStrengthYears = 30;

/** Below this share of comparable days having a value, a rank must say what is missing. */
export const minimumCoverage = 0.95;

// Narrow comparisons make records easy to set, and are less interesting to read.
const comparisonWeights: Record<Comparison, number> = {
  all: 1,
  season: 0.85,
  month: 0.8,
  year: 0.75,
  calendarDate: 0.6,
};

const measureWeights: Record<FactMeasure, number> = {
  maxTemp: 1,
  minTemp: 1,
  rain: 1,
  range: 0.9,
  solar: 0.9,
  minRelHum: 0.85,
  maxRelHum: 0.8,
  temp9am: 0.8,
  temp3pm: 0.8,
  relHum9am: 0.75,
  relHum3pm: 0.75,
  maxTempChange: 0.9,
  minTempChange: 0.85,
};

/** Scores a fact by its rank or its since, whichever is more striking; see docs/facts.md. */
export function scoreFact(fact: CandidateFact): ScoredFact {
  const rank = rankScore(fact);
  const since = sinceScore(fact);
  return {
    fact,
    score:
      Math.max(rank, since) *
      comparisonWeights[fact.comparison] *
      measureWeights[fact.measure],
    lead: since > rank ? "since" : "rank",
  };
}

/** The share of comparable days up to the fact's date that have a value. */
export function coverage({ compared, missingDays }: CandidateFact): number {
  return compared / (compared + missingDays);
}

function rankScore(fact: CandidateFact): number {
  const { rank, ties, compared, comparison } = fact;
  const atLeastAsExtreme = rank + ties;
  if (atLeastAsExtreme > lowestRank) return 0;
  if (comparison === "calendarDate" && rank > 1) return 0;
  // The missing days might hold values that beat it, so a rank is only as good as its coverage.
  return (
    Math.log(compared / atLeastAsExtreme) * recordWeight(fact) * coverage(fact)
  );
}

function recordWeight({
  comparison,
  recordStart,
  date,
}: CandidateFact): number {
  if (comparison === "year") return 1;
  const years = daysBetween(recordStart, date) / 365.25;
  return Math.min(1, Math.cbrt(years / fullStrengthYears));
}

// The year's since is always the same day as the since among all days, when it has one.
function sinceScore({
  comparison,
  since,
  gaps,
  comparedSince,
}: CandidateFact): number {
  if (since === null || comparison === "year" || comparison === "calendarDate")
    return 0;
  // A gap after the since day might hold a day that matched or beat this one.
  if (gaps.some(({ to }) => to > since.date)) return 0;
  return Math.log(comparedSince);
}
