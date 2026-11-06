import type {
  CalendarPeriod,
  Comparison,
  DateRange,
  DayValue,
  Direction,
  Period,
  ValueStatus,
} from "../shared/facts.ts";
import type { StationOffset } from "../shared/locations.ts";
import type { CandidateFact, CandidatesRequest } from "./candidates.ts";
import { beats, comparisonKey } from "./daily-facts.ts";
import { addDays } from "./dates.ts";
import type { Series } from "./series.ts";

type PeriodMeasure = "rain" | "maxTemp" | "minTemp";

const periodMeasures: readonly PeriodMeasure[] = ["rain", "maxTemp", "minTemp"];

/** Rain totals over this many days to each day. */
const rollingDays = [3, 7];

const calendarPeriods: readonly CalendarPeriod[] = ["month", "season", "year"];

const completeComparisons: Record<CalendarPeriod, readonly Comparison[]> = {
  month: ["all", "month"],
  season: ["season"],
  year: ["all"],
};

// A period so far is compared with the same days of earlier years, so it has one comparison.
const toDateComparison: Record<CalendarPeriod, Comparison> = {
  month: "month",
  season: "season",
  year: "all",
};

export const rollingComparisons: readonly Comparison[] = [
  "all",
  "season",
  "month",
];

/** A run of days is a spell only if no one day holds this share of its rain. */
const largestDayShare = 2 / 3;

/** A period so far needs this many days to say anything a day can't. */
const minimumToDateDays = 7;

/** A mean may miss this share of each month's days, and no more than `longestMissingRun` in a row. */
const missingShare = 1 / 6;
const longestMissingRun = 3;

/** A period's value, or null if too many of its days are missing. */
interface PeriodValue {
  from: string;
  to: string;
  fromDay: number;
  toDay: number;
  value: number | null;
  status: ValueStatus;
  /** The mean station offset over its days, for comparing across a station change. */
  offset: number;
}

type ValuedPeriod = PeriodValue & { value: number };

/**
 * Ranks rain totals over the 3 and 7 days to each day in the window, and the total rain
 * and mean maximum and minimum of the latest complete month, season and year and of the
 * current ones so far. See docs/facts.md.
 */
export function generatePeriodFacts({
  locationId,
  series,
  windowEnd,
  windowDays = 31,
  offsets = [],
}: CandidatesRequest): CandidateFact[] {
  const windowStart = dayNumber(addDays(windowEnd, 1 - windowDays));
  return periodMeasures.flatMap((measure) => {
    const source = series.find((s) => s.measure === measure);
    const first = source?.days[0];
    if (source === undefined || first === undefined) return [];
    const daily = dailyValues(source, offsets);
    const last = source.days.findLast(({ date }) => date <= windowEnd);
    if (last === undefined || dayNumber(last.date) < windowStart) return [];
    const lastDay = dayNumber(last.date);

    const fact = (
      period: Period,
      comparison: Comparison,
      periods: readonly PeriodValue[],
      candidate: ValuedPeriod,
      direction: Direction,
    ): CandidateFact[] => {
      const comparable = periods.filter(
        (p) => key(p, comparison) === key(candidate, comparison),
      );
      const ranking = rankPeriod(
        comparable,
        comparable.indexOf(candidate),
        direction,
      );
      if (ranking === undefined) return [];
      return [
        {
          locationId,
          date: candidate.to,
          from: candidate.from,
          period,
          measure,
          direction,
          value: candidate.value,
          status: candidate.status,
          comparison,
          ...ranking,
          recordStart: first.date,
          fullRecord: source.fullRecord,
        },
      ];
    };

    const rolling =
      measure === "rain"
        ? rollingDays.flatMap((days) => {
            const period: Period = { kind: "rolling", days };
            const periods = allPeriods(daily, period, lastDay);
            const candidates = periods
              .filter(isValued)
              .filter((p) => p.toDay >= windowStart && isSpell(daily, p));
            return rollingComparisons.flatMap((comparison) =>
              candidates.flatMap((candidate) =>
                fact(period, comparison, periods, candidate, "highest"),
              ),
            );
          })
        : [];

    const calendar = calendarPeriods.flatMap((kind) =>
      [false, true].flatMap((toDate) => {
        const period: Period = { kind, toDate };
        if (toDate && !hasToDate(kind, lastDay)) return [];
        const periods = allPeriods(daily, period, lastDay);
        const candidate = periods.at(-1);
        if (
          candidate === undefined ||
          !isValued(candidate) ||
          candidate.toDay < windowStart
        )
          return [];
        const comparisons = toDate
          ? [toDateComparison[kind]]
          : completeComparisons[kind];
        return comparisons.flatMap((comparison) =>
          (["highest", "lowest"] as const).flatMap((direction) =>
            fact(period, comparison, periods, candidate, direction),
          ),
        );
      }),
    );

    return [...rolling, ...calendar];
  });
}

/**
 * The periods a fact is compared with, up to and including its own, oldest first, for its
 * "why". Each has a null value if too many of its days are missing.
 */
export function comparablePeriods(
  series: Series,
  { period, comparison, date }: CandidateFact,
): { from: string; date: string; value: number | null }[] {
  const daily = dailyValues(series, []);
  const target = comparisonKey(date, comparison);
  return allPeriods(daily, period, dayNumber(date))
    .filter((p) => key(p, comparison) === target)
    .map(({ from, to, value }) => ({ from, date: to, value }));
}

/** A run of days whose total isn't in the series, such as a forecast's. */
export interface Run {
  from: string;
  date: string;
  value: number;
}

export interface RunRanker {
  /** The totals of the earlier runs comparable with one ending on `date`. */
  earlierValues: (date: string, comparison: Comparison) => number[];
  rank: (
    run: Run,
    comparison: Comparison,
    direction: Direction,
  ) => Ranking | undefined;
}

/**
 * Ranks runs of `days` days that start after the series ends, such as a forecast's,
 * against every run of that length in the series.
 */
export function runRanker(series: Series, days: number): RunRanker {
  const daily = dailyValues(series, []);
  const lastDay = dayNumber(series.days.at(-1)?.date ?? "1970-01-01");
  const periods = allPeriods(daily, { kind: "rolling", days }, lastDay);
  const comparable = (date: string, comparison: Comparison) =>
    periods.filter(
      (period) => key(period, comparison) === comparisonKey(date, comparison),
    );
  return {
    earlierValues: (date, comparison) =>
      comparable(date, comparison)
        .filter(isValued)
        .map(({ value }) => value),
    rank: (run, comparison, direction) => {
      const fromDay = dayNumber(run.from);
      if (fromDay <= lastDay) {
        throw new Error(`A run from ${run.from} overlaps the series`);
      }
      const candidate: PeriodValue = {
        from: run.from,
        to: run.date,
        fromDay,
        toDay: dayNumber(run.date),
        value: run.value,
        status: "forecast",
        offset: 0,
      };
      const runs = [...comparable(run.date, comparison), candidate];
      return rankPeriod(runs, runs.length - 1, direction);
    },
  };
}

/**
 * Whether a run of days says something its days don't: it starts and ends wet, so it
 * isn't a shorter run padded with dry days, and its rain didn't mostly fall on one day.
 */
function isSpell(daily: DailyValues, { fromDay, toDay, value }: ValuedPeriod) {
  if (!(daily.value(fromDay) > 0 && daily.value(toDay) > 0)) return false;
  for (let day = fromDay; day <= toDay; day++) {
    if (daily.value(day) >= value * largestDayShare) return false;
  }
  return true;
}

function key(period: PeriodValue, comparison: Comparison): string {
  return comparisonKey(period.to, comparison);
}

function isValued(period: PeriodValue): period is ValuedPeriod {
  return period.value !== null;
}

export type Ranking = Pick<
  CandidateFact,
  | "rank"
  | "ties"
  | "compared"
  | "since"
  | "comparedSince"
  | "beatenBy"
  | "missingDays"
  | "gaps"
>;

/**
 * Ranks a period against the earlier ones in its list, which is in date order. Rolling
 * periods overlap, so a run of them ending on consecutive days counts as one spell, and a
 * period that an overlapping earlier one matched or beat isn't a fact at all.
 */
function rankPeriod(
  periods: readonly PeriodValue[],
  index: number,
  direction: Direction,
): Ranking | undefined {
  const period = periods[index];
  if (period === undefined || !isValued(period)) return undefined;
  const earlier = periods.slice(0, index);
  const valued = earlier.filter(isValued);
  const { beatsEither, matchesOrBeats, equalsEither } = comparers(direction);

  if (
    valued.some(
      (other) => other.toDay >= period.fromDay && matchesOrBeats(other, period),
    )
  )
    return undefined;

  let rank = 1;
  let ties = 0;
  let lastBeat = -Infinity;
  let lastTie = -Infinity;
  for (const other of valued) {
    if (beatsEither(other, period)) {
      if (other.toDay !== lastBeat + 1) rank++;
      lastBeat = other.toDay;
    } else if (equalsEither(other, period)) {
      if (other.toDay !== lastTie + 1) ties++;
      lastTie = other.toDay;
    }
  }

  const sinceIndex = valued.findLastIndex((other) =>
    matchesOrBeats(other, period),
  );
  const missing = earlier.filter((other) => !isValued(other));
  return {
    rank,
    ties,
    compared: valued.length + 1,
    since: dayValue(valued[sinceIndex]),
    comparedSince: valued.length - sinceIndex,
    beatenBy: dayValue(
      periods
        .slice(index + 1)
        .filter(isValued)
        .find((other) => beatsEither(other, period)),
    ),
    missingDays: missing.length,
    gaps: mergedRanges(missing),
  };
}

// Across a station change, a period only beats another if it does so both as measured and
// with the stations' offsets taken out, so neither reading can make a fact untrue.
function comparers(direction: Direction) {
  const adjusted = ({ value, offset }: ValuedPeriod) =>
    Math.round((value - offset) * 100) / 100;
  const beatsEither = (a: ValuedPeriod, b: ValuedPeriod) =>
    beats(a.value, b.value, direction) ||
    beats(adjusted(a), adjusted(b), direction);
  const equalsEither = (a: ValuedPeriod, b: ValuedPeriod) =>
    a.value === b.value || adjusted(a) === adjusted(b);
  return {
    beatsEither,
    equalsEither,
    matchesOrBeats: (a: ValuedPeriod, b: ValuedPeriod) =>
      !(
        beats(b.value, a.value, direction) &&
        beats(adjusted(b), adjusted(a), direction)
      ),
  };
}

function dayValue(period: ValuedPeriod | undefined): DayValue | null {
  return period === undefined ? null : { date: period.to, value: period.value };
}

function mergedRanges(periods: readonly PeriodValue[]): DateRange[] {
  const ranges: (DateRange & { toDay: number })[] = [];
  for (const { from, to, fromDay, toDay } of periods) {
    const previous = ranges.at(-1);
    if (previous !== undefined && fromDay <= previous.toDay + 1) {
      previous.to = to;
      previous.toDay = toDay;
    } else {
      ranges.push({ from, to, toDay });
    }
  }
  return ranges.map(({ from, to }) => ({ from, to }));
}

/** Every period of a kind that ends by `lastDay`, in date order. */
function allPeriods(
  daily: DailyValues,
  period: Period,
  lastDay: number,
): PeriodValue[] {
  switch (period.kind) {
    case "day":
      throw new Error("A single day is not a period");
    case "rolling": {
      const periods: PeriodValue[] = [];
      for (
        let toDay = daily.firstDay + period.days - 1;
        toDay <= lastDay;
        toDay++
      ) {
        periods.push(daily.aggregate(toDay - period.days + 1, toDay));
      }
      return periods;
    }
    default:
      return period.toDate
        ? toDatePeriods(daily, period.kind, lastDay)
        : completePeriods(daily, period.kind, lastDay);
  }
}

function completePeriods(
  daily: DailyValues,
  kind: CalendarPeriod,
  lastDay: number,
): PeriodValue[] {
  const periods: PeriodValue[] = [];
  const first = dateOf(daily.firstDay);
  let from = periodStart(kind, first);
  if (from < first) from = nextPeriodStart(kind, from);
  for (; ; from = nextPeriodStart(kind, from)) {
    const toDay = dayNumber(nextPeriodStart(kind, from)) - 1;
    if (toDay > lastDay) return periods;
    periods.push(daily.aggregate(dayNumber(from), toDay));
  }
}

/** The current period so far, and the same days of every earlier year. */
function toDatePeriods(
  daily: DailyValues,
  kind: CalendarPeriod,
  lastDay: number,
): PeriodValue[] {
  const last = dateOf(lastDay);
  const start = periodStart(kind, last);
  const periods: PeriodValue[] = [];
  for (let years = 0; ; years++) {
    const from = shiftYears(start, -years);
    if (dayNumber(from) < daily.firstDay) return periods.reverse();
    periods.push(
      daily.aggregate(dayNumber(from), dayNumber(shiftYears(last, -years))),
    );
  }
}

/**
 * Whether the period holding `day` is under way but not complete, and far enough in to
 * say more than a shorter one: a season after its first month, and a year after January.
 */
function hasToDate(kind: CalendarPeriod, day: number): boolean {
  const date = dateOf(day);
  const start = periodStart(kind, date);
  const end = dayNumber(nextPeriodStart(kind, start)) - 1;
  if (day === end || day - dayNumber(start) + 1 < minimumToDateDays)
    return false;
  return kind === "month" || date.slice(0, 7) !== start.slice(0, 7);
}

function periodStart(kind: CalendarPeriod, date: string): string {
  const month = Number(date.slice(5, 7));
  switch (kind) {
    case "month":
      return `${date.slice(0, 7)}-01`;
    case "year":
      return `${date.slice(0, 4)}-01-01`;
    case "season":
      // Summer starts in December, so January and February belong to the year before's.
      return addMonths(`${date.slice(0, 7)}-01`, -(month % 3));
  }
}

function nextPeriodStart(kind: CalendarPeriod, start: string): string {
  return addMonths(start, { month: 1, season: 3, year: 12 }[kind]);
}

/** The first of the month `months` after a first of the month. */
function addMonths(start: string, months: number): string {
  const index = Number(start.slice(0, 4)) * 12 + Number(start.slice(5, 7)) - 1;
  const shifted = index + months;
  const month = String((shifted % 12) + 1).padStart(2, "0");
  return `${String(Math.floor(shifted / 12))}-${month}-01`;
}

/** The same date `years` later, with 29 February becoming the 28th in other years. */
function shiftYears(date: string, years: number): string {
  const shifted = `${String(Number(date.slice(0, 4)) + years)}${date.slice(4)}`;
  return shifted.endsWith("-02-29") && dateOf(dayNumber(shifted)) !== shifted
    ? `${shifted.slice(0, 8)}28`
    : shifted;
}

interface DailyValues {
  firstDay: number;
  /** A day's single-day value, or NaN if it has none. */
  value: (day: number) => number;
  aggregate: (fromDay: number, toDay: number) => PeriodValue;
}

/**
 * Indexes a series by day. Rain is totalled, counting a multi-day total that falls wholly
 * inside the period, and must have every day. Temperatures are averaged, and may miss a
 * few days in each month.
 */
function dailyValues(
  series: Series,
  offsets: readonly StationOffset[],
): DailyValues {
  const measure = series.measure as PeriodMeasure;
  const firstDay = dayNumber(series.days[0]?.date ?? "1970-01-01");
  const values: number[] = [];
  const provisional: boolean[] = [];
  for (const { date, value, status } of series.days) {
    values[dayNumber(date) - firstDay] = value;
    provisional[dayNumber(date) - firstDay] = status === "provisional";
  }
  const multiDay = (series.multiDay ?? []).map((total) => ({
    ...total,
    fromDay: dayNumber(total.from),
    toDay: dayNumber(total.date),
  }));
  const offsetOn = (date: string) =>
    measure === "rain"
      ? 0
      : (offsets.findLast((o) => o.from <= date)?.[measure] ?? 0);
  const value = (day: number) => values[day - firstDay] ?? Number.NaN;

  const sum = (fromDay: number, toDay: number) => {
    let total = 0;
    let isProvisional = false;
    for (let day = fromDay; day <= toDay; day++) {
      const dayValue = value(day);
      if (!Number.isNaN(dayValue)) {
        total += dayValue;
        isProvisional ||= provisional[day - firstDay] === true;
        continue;
      }
      const covering = multiDay.find((m) => m.fromDay <= day && m.toDay >= day);
      if (
        covering === undefined ||
        covering.fromDay < fromDay ||
        covering.toDay > toDay
      )
        return null;
      if (covering.toDay === day) total += covering.value;
    }
    return { value: Math.round(total * 10) / 10, isProvisional, offset: 0 };
  };

  const mean = (fromDay: number, toDay: number) => {
    let total = 0;
    let count = 0;
    let offset = 0;
    let isProvisional = false;
    let monthDays = 0;
    let monthMissing = 0;
    let run = 0;
    for (let day = fromDay; day <= toDay; day++) {
      const date = dateOf(day);
      if (day > fromDay && date.endsWith("-01")) {
        monthDays = monthMissing = run = 0;
      }
      monthDays++;
      const dayValue = value(day);
      if (Number.isNaN(dayValue)) {
        monthMissing++;
        run++;
      } else {
        run = 0;
        total += dayValue;
        count++;
        offset += offsetOn(date);
        isProvisional ||= provisional[day - firstDay] === true;
      }
      const monthEnd = day === toDay || dateOf(day + 1).endsWith("-01");
      if (
        run > longestMissingRun ||
        (monthEnd && monthMissing > Math.floor(monthDays * missingShare))
      )
        return null;
    }
    return {
      value: Math.round((total / count) * 10) / 10,
      isProvisional,
      offset: Math.round((offset / count) * 100) / 100,
    };
  };

  return {
    firstDay,
    value,
    aggregate: (fromDay, toDay) => {
      const result = (measure === "rain" ? sum : mean)(fromDay, toDay);
      return {
        from: dateOf(fromDay),
        to: dateOf(toDay),
        fromDay,
        toDay,
        value: result?.value ?? null,
        status: result?.isProvisional === true ? "provisional" : "confirmed",
        offset: result?.offset ?? 0,
      };
    },
  };
}

function dayNumber(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) / 86_400_000;
}

function dateOf(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}
