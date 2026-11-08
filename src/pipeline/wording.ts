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
  // The site names the night ("last night") and a day's rain ("the 24 hours to 9am
  // Friday"), so they need no noun.
  minTemp: {
    highest: { superlative: "warmest", noun: "", periodAfter: true },
    lowest: { superlative: "coldest", noun: "", periodAfter: true },
  },
  rain: {
    highest: { superlative: "wettest", noun: "", periodAfter: true },
    lowest: { superlative: "driest", noun: "", periodAfter: true },
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
 * What a fact's day or period was, without naming it, its value, its status or what beat
 * it: e.g. "the
 * 2nd hottest October day since records began in 1859" or "the wettest 7 days since 2022".
 */
export function describeFact(fact: CandidateFact, lead: Lead): string {
  const ranked = lead === "rank" ? rankWords(fact) : "";
  return [
    fact.period.kind === "day"
      ? dayHead(fact, ranked)
      : periodHead(fact, fact.period, ranked),
    lead === "rank" ? rankScope(fact) : sinceScope(fact),
    lead === "rank" ? caveat(fact) : "",
  ].join("");
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
  return [
    `the ${ranked}${phrase.superlative}`,
    subject(comparison, phrase, date),
  ]
    .filter((words) => words !== "")
    .join(" ");
}

// The site names the period, so a period compared with its own kind needs no noun:
// "October was the wettest since 2019", "The 3 days to Friday were the wettest in October".
// Its minimum needs saying: "had the warmest nights".
function periodHead(
  { measure, direction, comparison, date }: CandidateFact,
  period: Exclude<Period, { kind: "day" }>,
  ranked: string,
): string {
  const superlative = periodSuperlatives[measure]?.[direction];
  if (superlative === undefined) {
    throw new Error(`There are no period facts about ${measure}`);
  }
  const head = `the ${ranked}${superlative}`;
  const amongAllMonths = period.kind === "month" && comparison === "all";
  if (measure === "minTemp") {
    return amongAllMonths
      ? `the month with the ${ranked}${superlative} nights`
      : `${head} nights`;
  }
  switch (period.kind) {
    case "rolling":
      if (comparison === "season") {
        return `${head} in ${comparisonKey(date, "season")}`;
      }
      return comparison === "month"
        ? `${head} in ${format(date, { month: "long" })}`
        : head;
    case "year":
      return period.toDate ? `so far ${head} year` : `${head} year`;
    case "month":
      return amongAllMonths ? `${head} month` : head;
    case "season":
      return head;
  }
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
      return [noun, "of the year so far"].filter((w) => w !== "").join(" ");
    case "season": {
      const season = comparisonKey(date, "season");
      return periodAfter ? after(noun, `in ${season}`) : `${season} ${noun}`;
    }
    case "month": {
      const month = format(date, { month: "long" });
      return periodAfter ? after(noun, `in ${month}`) : `${month} ${noun}`;
    }
    case "calendarDate":
      // The site names the day, so a night or a day's rain is "the coldest for the date".
      if (noun === "") return "for the date";
      if (periodAfter) return after(noun, `on ${dayMonth(date)}`);
      return noun === "day" ? dayMonth(date) : `${dayMonth(date)} ${noun}`;
  }
}

function after(noun: string, words: string): string {
  return noun === "" ? words : `${noun} ${words}`;
}

function rankScope({
  comparison,
  fullRecord,
  recordStart,
  date,
}: CandidateFact): string {
  if (comparison === "year") return "";
  if (fullRecord) return ` since records began in ${recordStart.slice(0, 4)}`;
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
      // "The biggest rise in November since November 2024" says November twice.
      if (comparison === "month") return ` since ${since.date.slice(0, 4)}`;
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
    return ` (not counting ${String(fact.missingDays)} ${missingUnit(fact)} with gaps)`;
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
