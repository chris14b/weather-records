import type {
  ChangingMeasure,
  Comparison,
  DateRange,
  Direction,
  FactMeasure,
  Lead,
  Period,
} from "../shared/facts.ts";
import type { CandidateFact } from "./candidates.ts";
import { comparisonKey } from "./daily-facts.ts";
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

const periodSuperlatives: Partial<
  Record<FactMeasure, Record<Direction, string>>
> = {
  rain: { highest: "wettest", lowest: "driest" },
  maxTemp: { highest: "hottest", lowest: "coldest" },
  minTemp: { highest: "warmest", lowest: "coldest" },
};

/**
 * What a fact's day or period was, without naming it: e.g. "the 2nd hottest October day on
 * record" or "the wettest 7 days since 2022".
 */
export function describeFact(fact: CandidateFact, lead: Lead): string {
  const { beatenBy, date, status } = fact;
  const ranked = lead === "rank" ? rankWords(fact) : "";
  const text = [
    fact.period.kind === "day"
      ? dayHead(fact, ranked)
      : periodHead(fact, fact.period, ranked),
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

function dayHead(
  { measure, direction, comparison, date }: CandidateFact,
  ranked: string,
): string {
  const phrase = phrases[measure][direction];
  return `the ${ranked}${phrase.superlative} ${subject(comparison, phrase, date)}`;
}

// A period's maximum is its days', so "the hottest October"; its minimum needs saying.
function periodHead(
  { measure, direction, comparison, date }: CandidateFact,
  period: Exclude<Period, { kind: "day" }>,
  ranked: string,
): string {
  const superlative = periodSuperlatives[measure]?.[direction];
  if (superlative === undefined) {
    throw new Error(`There are no period facts about ${measure}`);
  }
  const name = periodName(period, comparison, date);
  return measure === "minTemp"
    ? `the ${name} with the ${ranked}${superlative} nights`
    : `the ${ranked}${superlative} ${name}`;
}

function periodName(
  period: Exclude<Period, { kind: "day" }>,
  comparison: Comparison,
  date: string,
): string {
  const month = format(date, { month: "long" });
  const season = comparisonKey(date, "season");
  if (period.kind === "rolling") {
    const days = `${String(period.days)} days`;
    if (comparison === "season") return `${days} in ${season}`;
    return comparison === "month" ? `${days} in ${month}` : days;
  }
  const name = { month, season, year: "year" }[period.kind];
  if (period.toDate) {
    return `start to ${period.kind === "year" ? "the year" : name}`;
  }
  return comparison === "all" ? period.kind : name;
}

function rankWords({ rank, ties }: CandidateFact): string {
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
}: CandidateFact): string {
  if (comparison === "year") return "";
  if (fullRecord) return " on record";
  const years = daysBetween(recordStart, date) / 365.25;
  return ` since ${recordStart.endsWith("-01-01") || years >= 3 ? recordStart.slice(0, 4) : monthYear(recordStart)}`;
}

function sinceScope({
  since,
  date,
  period,
  comparison,
}: CandidateFact): string {
  if (since === null) throw new Error(`A fact for ${date} has no since`);
  switch (period.kind) {
    case "day":
    case "rolling":
      return ` since ${earlierDay(since.date, date)}`;
    case "month":
      if (!period.toDate && comparison === "all")
        return ` since ${earlierMonth(since.date, date)}`;
  }
  // Every other period is compared with one a year.
  return ` since ${since.date.slice(0, 4)}`;
}

function caveat(fact: CandidateFact): string {
  if (coverage(fact) >= minimumCoverage) return "";
  if (fact.period.kind !== "day") {
    return ` (with ${String(fact.missingDays)} ${missingUnit(fact)} too incomplete to compare)`;
  }
  const longest = fact.gaps.reduce<DateRange | undefined>(
    (best, gap) =>
      best === undefined || length(gap) > length(best) ? gap : best,
    undefined,
  );
  return longest === undefined
    ? ` (with ${String(fact.missingDays)} days missing)`
    : ` (no records from ${monthYear(longest.from)} to ${monthYear(longest.to)})`;
}

function missingUnit({ period, comparison }: CandidateFact): string {
  if (period.kind === "day") return "days";
  if (period.kind === "rolling") return "runs of days";
  if (period.toDate || comparison !== "all") return "years";
  return `${period.kind}s`;
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

function earlierMonth(earlier: string, date: string): string {
  if (earlier.slice(0, 4) === date.slice(0, 4)) {
    return format(earlier, { month: "long" });
  }
  return daysBetween(earlier, date) < 3 * 365
    ? monthYear(earlier)
    : earlier.slice(0, 4);
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
