import type {
  Comparison,
  DateRange,
  Direction,
  Period,
  StreakKind,
} from "../shared/facts.ts";
import type { CandidateFact, CandidatesRequest } from "./candidates.ts";
import { comparisonKey } from "./daily-facts.ts";
import { addDays, daysBetween } from "./dates.ts";
import type { Series } from "./series.ts";

interface StreakRule {
  measure: "rain" | "maxTemp" | "minTemp";
  /** Lowest for a dry streak, so it doesn't compete with facts about wet days. */
  direction: Direction;
  qualifies: (value: number) => boolean;
  /** The shortest run worth calling a streak. */
  minimumLength: number;
}

// Fixed thresholds, so the wording can name them; comparing by season and month covers the
// time of year. Sydney has about 30 runs of 3 dry days a year, but two 35°C days in a row are rare.
const streakRules: Record<StreakKind, StreakRule> = {
  dry: {
    measure: "rain",
    direction: "lowest",
    qualifies: (mm) => mm === 0,
    minimumLength: 5,
  },
  max30: {
    measure: "maxTemp",
    direction: "highest",
    qualifies: (temp) => temp >= 30,
    minimumLength: 3,
  },
  max35: {
    measure: "maxTemp",
    direction: "highest",
    qualifies: (temp) => temp >= 35,
    minimumLength: 2,
  },
  min20: {
    measure: "minTemp",
    direction: "highest",
    qualifies: (temp) => temp >= 20,
    minimumLength: 3,
  },
};

const streakKinds = Object.keys(streakRules) as StreakKind[];

const comparisons: readonly Comparison[] = ["all", "season", "month"];

const minimumGapDays = 7;

/**
 * Ranks the streak each day in the window ends, by its length so far, against the earlier
 * streaks of the same kind. A missing day ends a streak. See docs/facts.md.
 */
export function generateStreakFacts({
  locationId,
  series,
  windowEnd,
  windowDays = 31,
}: CandidatesRequest): CandidateFact[] {
  const windowStart = addDays(windowEnd, 1 - windowDays);
  return streakKinds.flatMap((streak) => {
    const rule = streakRules[streak];
    const source = series.find((s) => s.measure === rule.measure);
    const days = source && streakDays(source, rule, windowEnd);
    if (source === undefined || days === undefined) return [];
    const { dates, qualifies, lengthAt, runs, provisional } = days;
    const facts: CandidateFact[] = [];
    for (
      let index = Math.max(
        0,
        daysBetween(dates[0] ?? windowStart, windowStart),
      );
      index < dates.length;
      index++
    ) {
      const length = lengthAt[index] ?? 0;
      if (length < rule.minimumLength) continue;
      const run = runAt(runs, index);
      // After a missing day, the streak may have started earlier, so its length is unknown.
      if (run.openStart) continue;
      const fromIndex = index - length + 1;
      const period: Period = {
        kind: "streak",
        streak,
        ended: qualifies[index + 1] === false,
      };
      const isProvisional = provisional
        .slice(fromIndex, index + 1)
        .some(Boolean);
      for (const comparison of comparisons) {
        const { keys, valuedUpTo, missingBefore } = days.counts(comparison);
        const key = keys[index];
        const earlier = runs.filter(
          (other) => other.toIndex < fromIndex && keys[other.toIndex] === key,
        );
        const sinceRun = earlier.findLast((other) => other.length >= length);
        const compared = valuedUpTo[index] ?? 0;
        const beatenIndex = firstBeaten(days, keys, key, run, length);
        facts.push({
          locationId,
          date: dates[index] ?? "",
          from: dates[fromIndex] ?? "",
          period,
          measure: rule.measure,
          direction: rule.direction,
          value: length,
          status: isProvisional ? "provisional" : "confirmed",
          comparison,
          rank: 1 + earlier.filter((other) => other.length > length).length,
          ties: earlier.filter((other) => other.length === length).length,
          compared,
          recordStart: source.days[0]?.date ?? "",
          fullRecord: source.fullRecord,
          missingDays: missingBefore[index] ?? 0,
          gaps: days.gaps(index, comparison),
          since:
            sinceRun === undefined
              ? null
              : { date: dates[sinceRun.toIndex] ?? "", value: sinceRun.length },
          comparedSince:
            sinceRun === undefined
              ? compared
              : compared - (valuedUpTo[sinceRun.toIndex] ?? 0),
          beatenBy:
            beatenIndex === -1
              ? null
              : {
                  date: dates[beatenIndex] ?? "",
                  value: lengthAt[beatenIndex] ?? 0,
                },
        });
      }
    }
    return facts;
  });
}

/**
 * The streaks a streak fact is compared with, and the fact's own as it stood on its date,
 * oldest first, for its "why".
 */
export function comparableStreaks(
  series: Series,
  { period, comparison, from, date, value }: CandidateFact,
): { from: string; date: string; value: number }[] {
  if (period.kind !== "streak") throw new Error("Not a streak fact");
  const days = streakDays(series, streakRules[period.streak], date);
  if (days === undefined) return [];
  const { keys } = days.counts(comparison);
  const key = comparisonKey(date, comparison);
  return [
    ...days.runs
      .filter(
        ({ toIndex }) =>
          (days.dates[toIndex] ?? "") < from && keys[toIndex] === key,
      )
      .map(({ fromIndex, toIndex, length }) => ({
        from: days.dates[fromIndex] ?? "",
        date: days.dates[toIndex] ?? "",
        value: length,
      })),
    { from, date, value },
  ];
}

/** The first later day on which a later streak with the same key is longer. */
function firstBeaten(
  { lengthAt, runs }: { lengthAt: readonly number[]; runs: readonly Run[] },
  keys: readonly string[],
  key: string | undefined,
  run: Run,
  length: number,
): number {
  for (let index = run.toIndex + 1; index < lengthAt.length; index++) {
    if (
      (lengthAt[index] ?? 0) > length &&
      keys[index] === key &&
      !runAt(runs, index).openStart
    )
      return index;
  }
  return -1;
}

interface Run {
  fromIndex: number;
  toIndex: number;
  length: number;
  /** Whether it starts on the first day or after a missing day, so it may have started earlier. */
  openStart: boolean;
}

function runAt(runs: readonly Run[], index: number): Run {
  const run = runs.find(
    ({ fromIndex, toIndex }) => fromIndex <= index && toIndex >= index,
  );
  if (run === undefined) throw new Error(`No streak on day ${String(index)}`);
  return run;
}

interface ComparisonCounts {
  keys: string[];
  /** Comparable days with a value, up to and including each day. */
  valuedUpTo: number[];
  /** Comparable days with no value before each day. */
  missingBefore: number[];
}

/**
 * Every day from the series' first to its last by `end`, and whether each qualifies, or
 * null if it has no value. A multi-day rain total of 0 mm shows that every day it covers
 * was dry, so those days count as 0 mm. Any other multi-day total leaves its days missing.
 */
function streakDays(series: Series, rule: StreakRule, end: string) {
  const first = series.days[0]?.date;
  const last = series.days.findLast(({ date }) => date <= end)?.date;
  if (first === undefined || last === undefined) return undefined;
  const dates = Array.from({ length: daysBetween(first, last) + 1 }, (_, i) =>
    addDays(first, i),
  );
  const qualifies: (boolean | null)[] = dates.map(() => null);
  const provisional: boolean[] = dates.map(() => false);
  const mark = (date: string, value: number, isProvisional: boolean) => {
    const index = daysBetween(first, date);
    if (index < 0 || index >= dates.length) return;
    qualifies[index] = rule.qualifies(value);
    provisional[index] = isProvisional;
  };
  if (rule.measure === "rain") {
    for (const total of series.multiDay ?? []) {
      if (total.value !== 0) continue;
      for (let date = total.from; date <= total.date; date = addDays(date, 1)) {
        mark(date, 0, total.status === "provisional");
      }
    }
  }
  for (const { date, value, status } of series.days) {
    mark(date, value, status === "provisional");
  }

  const lengthAt: number[] = [];
  const runs: Run[] = [];
  for (const [index, day] of qualifies.entries()) {
    const length = day === true ? (lengthAt[index - 1] ?? 0) + 1 : 0;
    lengthAt.push(length);
    if (length === 1) {
      runs.push({
        fromIndex: index,
        toIndex: index,
        length,
        openStart: index === 0 || qualifies[index - 1] === null,
      });
    } else if (length > 1) {
      const run = runs.at(-1);
      if (run !== undefined) {
        run.toIndex = index;
        run.length = length;
      }
    }
  }

  const missingRuns: DateRange[] = [];
  for (const [index, day] of qualifies.entries()) {
    if (day !== null) continue;
    const previous = missingRuns.at(-1);
    const date = dates[index] ?? "";
    if (previous?.to === addDays(date, -1)) {
      previous.to = date;
    } else {
      missingRuns.push({ from: date, to: date });
    }
  }

  const cache = new Map<Comparison, ComparisonCounts>();
  const counts = (comparison: Comparison): ComparisonCounts => {
    const cached = cache.get(comparison);
    if (cached !== undefined) return cached;
    const keys = dates.map((date) => comparisonKey(date, comparison));
    const valued = new Map<string, number>();
    const missing = new Map<string, number>();
    const valuedUpTo: number[] = [];
    const missingBefore: number[] = [];
    for (const [index, key] of keys.entries()) {
      missingBefore.push(missing.get(key) ?? 0);
      const counter = qualifies[index] === null ? missing : valued;
      counter.set(key, (counter.get(key) ?? 0) + 1);
      valuedUpTo.push(valued.get(key) ?? 0);
    }
    const result = { keys, valuedUpTo, missingBefore };
    cache.set(comparison, result);
    return result;
  };

  // Runs of at least a week of missing days before a day that include a comparable day.
  const gaps = (index: number, comparison: Comparison): DateRange[] => {
    const date = dates[index] ?? "";
    const key = comparisonKey(date, comparison);
    return missingRuns.filter(({ from, to }) => {
      if (to >= date || daysBetween(from, to) + 1 < minimumGapDays)
        return false;
      for (let day = from; day <= to; day = addDays(day, 1)) {
        if (comparisonKey(day, comparison) === key) return true;
      }
      return false;
    });
  };

  return { dates, qualifies, provisional, lengthAt, runs, counts, gaps };
}
