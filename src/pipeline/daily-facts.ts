import type {
  Comparison,
  DateRange,
  DayValue,
  Direction,
  FactMeasure,
  ValueStatus,
} from "../shared/facts.ts";
import { addDays } from "./dates.ts";
import type { Series, SeriesDay } from "./series.ts";

const comparisons: readonly Comparison[] = [
  "all",
  "year",
  "season",
  "month",
  "calendarDate",
];

const minimumGapDays = 7;

/** How one day ranks against the comparable days up to and including it. */
export interface DailyFact {
  locationId: string;
  date: string;
  measure: FactMeasure;
  direction: Direction;
  value: number;
  status: ValueStatus;
  comparison: Comparison;
  /** One more than the number of comparable days that beat it, so tied days share a rank. */
  rank: number;
  /** Earlier comparable days with exactly the same value. */
  ties: number;
  /** Comparable days with a value, including this one. */
  compared: number;
  /** The first date of the measure's series. */
  recordStart: string;
  /** Whether the series goes back to when records began, so "on record" is true. */
  fullRecord: boolean;
  /** Comparable days between the record start and this day with no value. */
  missingDays: number;
  /** Runs of at least a week of missing days that include a comparable day, before this day. */
  gaps: DateRange[];
  /** The most recent earlier comparable day that matched or beat it; null if none did. */
  since: DayValue | null;
  /** Comparable days with a value after `since`, including this one; all of them if `since` is null. */
  comparedSince: number;
  /** The first later comparable day, up to the end of the window, that beat it. */
  beatenBy: DayValue | null;
}

export interface DailyFactsRequest {
  locationId: string;
  series: readonly Series[];
  /** The window's last day, normally today in Sydney. */
  windowEnd: string;
  windowDays?: number;
}

/**
 * Ranks every day in the window that has a value, for each measure, direction and
 * comparison. Each day is compared only with the days up to and including it.
 */
export function generateDailyFacts({
  locationId,
  series,
  windowEnd,
  windowDays = 31,
}: DailyFactsRequest): DailyFact[] {
  const windowStart = addDays(windowEnd, 1 - windowDays);
  return series.flatMap(({ measure, days, fullRecord }) => {
    const first = days[0];
    if (first === undefined) return [];
    const runs = missingRuns(days);
    const inWindow = [...days.entries()].filter(
      ([, { date }]) => date >= windowStart && date <= windowEnd,
    );
    return comparisons.flatMap((comparison) => {
      const keyOf = (date: string) => comparisonKey(date, comparison);
      const keys = days.map(({ date }) => keyOf(date));
      return inWindow.flatMap(([index, day]) => {
        const key = keys[index];
        const comparable = (date: string) => keyOf(date) === key;
        const missing = runs.flatMap(({ dates }) =>
          dates.filter((date) => date < day.date && comparable(date)),
        );
        const gaps = runs
          .filter(
            ({ dates }) =>
              dates.length >= minimumGapDays &&
              dates.some((date) => date < day.date && comparable(date)),
          )
          .map(({ range }) => range);
        const earlier = days.filter(
          (_, other) => other < index && keys[other] === key,
        );
        const later = days.filter(
          ({ date }, other) =>
            other > index && date <= windowEnd && keys[other] === key,
        );
        return directionsFor(measure, day.value).map(
          (direction): DailyFact => ({
            locationId,
            date: day.date,
            measure,
            direction,
            value: day.value,
            status: day.status,
            comparison,
            ...rank(day, earlier, direction),
            recordStart: first.date,
            fullRecord,
            missingDays: missing.length,
            gaps,
            beatenBy: dayValue(
              later.find((other) => beats(other.value, day.value, direction)),
            ),
          }),
        );
      });
    });
  });
}

// A dry day is never the wettest of anything, and the lowest rain is always 0 mm.
function directionsFor(measure: FactMeasure, value: number): Direction[] {
  if (measure === "rain") return value > 0 ? ["highest"] : [];
  return ["highest", "lowest"];
}

function rank(
  day: SeriesDay,
  earlier: readonly SeriesDay[],
  direction: Direction,
): Pick<DailyFact, "rank" | "ties" | "compared" | "since" | "comparedSince"> {
  const beaten = earlier.filter((other) =>
    beats(other.value, day.value, direction),
  ).length;
  const ties = earlier.filter((other) => other.value === day.value).length;
  const sinceIndex = earlier.findLastIndex(
    (other) => !beats(day.value, other.value, direction),
  );
  return {
    rank: beaten + 1,
    ties,
    compared: earlier.length + 1,
    since: dayValue(earlier[sinceIndex]),
    comparedSince: earlier.length - sinceIndex,
  };
}

export function beats(
  value: number,
  other: number,
  direction: Direction,
): boolean {
  return direction === "highest" ? value > other : value < other;
}

function dayValue(day: SeriesDay | undefined): DayValue | null {
  return day === undefined ? null : { date: day.date, value: day.value };
}

const seasons = [
  "summer",
  "summer",
  "autumn",
  "autumn",
  "autumn",
  "winter",
  "winter",
  "winter",
  "spring",
  "spring",
  "spring",
  "summer",
] as const;

/** Days with the same key are compared with each other. */
export function comparisonKey(date: string, comparison: Comparison): string {
  switch (comparison) {
    case "all":
      return "";
    case "year":
      return date.slice(0, 4);
    case "season":
      return seasons[Number(date.slice(5, 7)) - 1] ?? "";
    case "month":
      return date.slice(5, 7);
    case "calendarDate":
      return date.slice(5);
  }
}

interface MissingRun {
  range: DateRange;
  dates: string[];
}

function missingRuns(days: readonly SeriesDay[]): MissingRun[] {
  const runs: MissingRun[] = [];
  for (const [index, day] of days.entries()) {
    const next = days[index + 1];
    if (next === undefined) break;
    const dates: string[] = [];
    for (let date = addDays(day.date, 1); date < next.date;) {
      dates.push(date);
      date = addDays(date, 1);
    }
    const [from, to] = [dates[0], dates.at(-1)];
    if (from !== undefined && to !== undefined) {
      runs.push({ range: { from, to }, dates });
    }
  }
  return runs;
}
