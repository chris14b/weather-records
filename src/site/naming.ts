import type { Fact } from "../shared/facts.ts";

const weekdays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

// 1 January 1970, day 0, was a Thursday.
const epochWeekday = 3;

const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const sydneyDateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Australia/Sydney",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The date in Sydney at an instant, as YYYY-MM-DD. */
export function sydneyDate(instant: Date): string {
  return sydneyDateFormat.format(instant);
}

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

function parse(date: string): CalendarDate {
  const [year = NaN, month = NaN, day = NaN] = date.split("-").map(Number);
  return { year, month, day };
}

function utcDay({ year, month, day }: CalendarDate): number {
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

function daysFrom(today: string, date: string): number {
  return utcDay(parse(date)) - utcDay(parse(today));
}

function monthName(month: number): string {
  return months[month - 1] ?? "";
}

/**
 * A day named as it reads mid-sentence from the viewer's today: "today", "yesterday",
 * "tomorrow", a weekday within 6 days either way, otherwise "12 October", with the year
 * when it isn't this year's.
 */
export function dayName(date: string, today: string): string {
  const offset = daysFrom(today, date);
  if (offset === 0) return "today";
  if (offset === -1) return "yesterday";
  if (offset === 1) return "tomorrow";

  const parsed = parse(date);
  if (Math.abs(offset) <= 6) return weekday(parsed);
  const dayAndMonth = `${String(parsed.day)} ${monthName(parsed.month)}`;
  return parsed.year === parse(today).year
    ? dayAndMonth
    : `${dayAndMonth} ${String(parsed.year)}`;
}

function weekday(date: CalendarDate): string {
  const index = (((utcDay(date) + epochWeekday) % 7) + 7) % 7;
  return weekdays[index] ?? "";
}

/** A date in full: "Monday 9 November 2026". */
export function longDate(date: string): string {
  const parsed = parse(date);
  return `${weekday(parsed)} ${String(parsed.day)} ${monthName(parsed.month)} ${String(parsed.year)}`;
}

function seasonName(month: number): string {
  if (month === 12 || month <= 2) return "summer";
  if (month <= 5) return "autumn";
  if (month <= 8) return "winter";
  return "spring";
}

type Named = Pick<Fact, "period" | "from" | "date">;

/** What the site needs of a fact to make a sentence of it. */
export type Phrased = Named & Pick<Fact, "status" | "text">;

/** What a fact is about, named mid-sentence: "today", "the 3 days to Tuesday", "November so far". */
export function periodName(
  { period, from, date }: Named,
  today: string,
): string {
  const start = parse(from);
  switch (period.kind) {
    case "day":
      return dayName(date, today);
    case "rolling":
      return `the ${String(period.days)} days to ${dayName(date, today)}`;
    case "month": {
      const month = monthName(start.month);
      if (period.toDate) return `${month} so far`;
      return start.year === parse(today).year
        ? month
        : `${month} ${String(start.year)}`;
    }
    case "season": {
      const season = seasonName(start.month);
      return period.toDate ? `${season} so far` : season;
    }
    case "year":
      return period.toDate ? "the year so far" : String(start.year);
  }
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function verb(fact: Phrased, today: string): string {
  const plural = fact.period.kind === "rolling";
  if (fact.status === "conditional") return "";
  if (fact.status === "forecast") return plural ? "are" : "is";

  const ongoing =
    "toDate" in fact.period ? fact.period.toDate : fact.date >= today;
  if (ongoing) return plural ? "are" : "is";
  return plural ? "were" : "was";
}

export interface Sentence {
  /** The day or period, capitalised: "Saturday", "November so far". */
  subject: string;
  /** The rest, without a full stop: "was the wettest day since 16 October". */
  predicate: string;
}

/** A fact as a sentence for the viewer's today, from the subject the site adds and the fact's own text. */
export function sentence(fact: Phrased, today: string): Sentence {
  const linking = verb(fact, today);
  return {
    subject: capitalise(periodName(fact, today)),
    predicate: linking === "" ? fact.text : `${linking} ${fact.text}`,
  };
}
