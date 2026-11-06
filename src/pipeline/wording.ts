import type {
  ChangingMeasure,
  Comparison,
  DateRange,
  Direction,
  FactMeasure,
  Lead,
} from "../shared/facts.ts";
import { comparisonKey, type DailyFact } from "./daily-facts.ts";
import { daysBetween } from "./dates.ts";
import { coverage, minimumCoverage } from "./scoring.ts";

interface Phrase {
  superlative: string;
  noun: string;
  /** Whether the comparison follows the noun ("in October") rather than leading it. */
  periodAfter?: boolean;
}

const changing: Record<ChangingMeasure, string> = {
  maxTemp: "maximum temperature",
  minTemp: "minimum temperature",
};

function changePhrases(measure: ChangingMeasure): Record<Direction, Phrase> {
  const phrase = (change: string) => ({
    superlative: "biggest",
    noun: `day-to-day ${change} in ${changing[measure]}`,
    periodAfter: true,
  });
  return { highest: phrase("rise"), lowest: phrase("drop") };
}

const phrases: Record<FactMeasure, Record<Direction, Phrase>> = {
  maxTemp: {
    highest: { superlative: "hottest", noun: "day" },
    lowest: { superlative: "coldest", noun: "day" },
  },
  minTemp: {
    highest: { superlative: "warmest", noun: "night" },
    lowest: { superlative: "coldest", noun: "night" },
  },
  rain: {
    highest: { superlative: "wettest", noun: "day" },
    lowest: { superlative: "driest", noun: "day" },
  },
  range: {
    highest: { superlative: "biggest", noun: "temperature range" },
    lowest: { superlative: "smallest", noun: "temperature range" },
  },
  maxRelHum: {
    highest: { superlative: "highest", noun: "peak humidity" },
    lowest: { superlative: "lowest", noun: "peak humidity" },
  },
  minRelHum: {
    highest: { superlative: "most humid", noun: "day" },
    lowest: { superlative: "lowest", noun: "humidity" },
  },
  solar: {
    highest: { superlative: "sunniest", noun: "day" },
    lowest: { superlative: "gloomiest", noun: "day" },
  },
  temp9am: {
    highest: { superlative: "warmest", noun: "9am" },
    lowest: { superlative: "coldest", noun: "9am" },
  },
  temp3pm: {
    highest: { superlative: "warmest", noun: "3pm" },
    lowest: { superlative: "coldest", noun: "3pm" },
  },
  relHum9am: {
    highest: { superlative: "most humid", noun: "9am" },
    lowest: { superlative: "driest", noun: "9am" },
  },
  relHum3pm: {
    highest: { superlative: "most humid", noun: "3pm" },
    lowest: { superlative: "driest", noun: "3pm" },
  },
  maxTempChange: changePhrases("maxTemp"),
  minTempChange: changePhrases("minTemp"),
};

/** What a fact's day was, without naming the day: e.g. "the 2nd hottest October day on record". */
export function describeFact(fact: DailyFact, lead: Lead): string {
  const { measure, direction, comparison, date, beatenBy, status } = fact;
  const phrase = phrases[measure][direction];
  const ranked =
    lead === "rank"
      ? `${rankWords(fact)}${phrase.superlative}`
      : phrase.superlative;
  const text = [
    `the ${ranked} ${subject(comparison, phrase, date)}`,
    lead === "rank" ? rankScope(fact) : sinceScope(fact),
    lead === "rank" ? caveat(fact) : "",
    beatenBy === null ? "" : `, until ${laterDay(beatenBy.date, date)}`,
  ].join("");
  return status === "provisional" ? `provisionally ${text}` : text;
}

/** 1st, 2nd, 3rd, 4th… */
export function ordinal(n: number): string {
  const lastTwo = n % 100;
  const suffix =
    lastTwo >= 11 && lastTwo <= 13
      ? "th"
      : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${String(n)}${suffix}`;
}

function rankWords({ rank, ties }: DailyFact): string {
  return `${ties > 0 ? "equal " : ""}${rank > 1 ? `${ordinal(rank)} ` : ""}`;
}

function subject(
  comparison: Comparison,
  { noun, periodAfter = false }: Phrase,
  date: string,
): string {
  switch (comparison) {
    case "all":
      return noun;
    case "year":
      return `${noun} of the year so far`;
    case "season": {
      const season = comparisonKey(date, "season");
      return periodAfter ? `${noun} in ${season}` : `${season} ${noun}`;
    }
    case "month": {
      const month = format(date, { month: "long" });
      return periodAfter ? `${noun} in ${month}` : `${month} ${noun}`;
    }
    case "calendarDate":
      if (periodAfter) return `${noun} on ${dayMonth(date)}`;
      return noun === "day" ? dayMonth(date) : `${dayMonth(date)} ${noun}`;
  }
}

function rankScope({
  comparison,
  fullRecord,
  recordStart,
  date,
}: DailyFact): string {
  if (comparison === "year") return "";
  if (fullRecord) return " on record";
  const years = daysBetween(recordStart, date) / 365.25;
  return ` since ${recordStart.endsWith("-01-01") || years >= 3 ? recordStart.slice(0, 4) : monthYear(recordStart)}`;
}

function sinceScope({ since, date }: DailyFact): string {
  if (since === null) throw new Error(`A fact for ${date} has no since`);
  return ` since ${earlierDay(since.date, date)}`;
}

function caveat(fact: DailyFact): string {
  if (coverage(fact) >= minimumCoverage) return "";
  const longest = fact.gaps.reduce<DateRange | undefined>(
    (best, gap) =>
      best === undefined || length(gap) > length(best) ? gap : best,
    undefined,
  );
  return longest === undefined
    ? ` (with ${String(fact.missingDays)} days missing)`
    : ` (no records from ${monthYear(longest.from)} to ${monthYear(longest.to)})`;
}

function length({ from, to }: DateRange): number {
  return daysBetween(from, to);
}

// A weekday would be ambiguous here, since the page names the fact's own day.
function earlierDay(earlier: string, date: string): string {
  const days = daysBetween(earlier, date);
  if (earlier.slice(0, 4) === date.slice(0, 4)) return dayMonth(earlier);
  if (days < 365) return `${dayMonth(earlier)} ${earlier.slice(0, 4)}`;
  if (days < 3 * 365) return monthYear(earlier);
  return earlier.slice(0, 4);
}

function laterDay(later: string, date: string): string {
  return daysBetween(date, later) <= 6 ? weekday(later) : dayMonth(later);
}

function weekday(date: string): string {
  return format(date, { weekday: "long" });
}

function dayMonth(date: string): string {
  return format(date, { day: "numeric", month: "long" });
}

function monthYear(date: string): string {
  return format(date, { month: "long", year: "numeric" });
}

function format(date: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-AU", {
    ...options,
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}
