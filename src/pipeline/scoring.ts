import type {
  Comparison,
  DaylightEvent,
  FactMeasure,
  Lead,
} from "../shared/facts.ts";
import type { CandidateFact } from "./candidates.ts";
import { addDays, daysBetween } from "./dates.ts";
import type { DaylightCandidate } from "./daylight-facts.ts";

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
  calendarDate: 0.8,
  dayOfWeek: 0.7,
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

/** The year has six turning points in its daylight, so each comes about once in 61 days. */
const daylightScore = Math.log(365.25 / 6);

// The solstices are the turning points people know.
const daylightWeights: Record<DaylightEvent, number> = {
  longestDay: 1,
  shortestDay: 1,
  earliestSunrise: 0.9,
  latestSunrise: 0.9,
  earliestSunset: 0.9,
  latestSunset: 0.9,
};

/** Scores a turning point in the daylight on the same scale as a day's facts; see docs/facts.md. */
export function scoreDaylight({ event, scope }: DaylightCandidate): number {
  const scopeWeight = scope === "season" ? comparisonWeights.season : 1;
  return daylightScore * daylightWeights[event] * scopeWeight;
}

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
  const { rank, ties, compared } = fact;
  const atLeastAsExtreme = rank + ties;
  if (atLeastAsExtreme > lowestRank) return 0;
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
  date,
  period,
}: CandidateFact): number {
  if (since === null || comparison === "year") return 0;
  // A gap after the since day might hold a day that matched or beat this one.
  if (gaps.some(({ to }) => to > since.date)) return 0;
  // "The coldest November night since 13 November 2025" sounds rarer than it is.
  if (
    (comparison === "month" || comparison === "season") &&
    (period.kind === "day" || period.kind === "rolling") &&
    since.date >= previousOccurrence(date, comparison)
  ) {
    return 0;
  }
  // "The wettest Saturday since 31 October" is only a week.
  if (comparison === "dayOfWeek" && since.date >= addDays(date, -364)) return 0;
  return Math.log(comparedSince);
}

/** The first day of the same month or season a year before the one `date` is in. */
export function previousOccurrence(
  date: string,
  comparison: "month" | "season",
): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const start =
    comparison === "month"
      ? { year, month }
      : month === 12
        ? { year, month: 12 }
        : month <= 2
          ? { year: year - 1, month: 12 }
          : { year, month: month - (month % 3) };
  return `${String(start.year - 1)}-${String(start.month).padStart(2, "0")}-01`;
}
