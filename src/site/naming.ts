import {
  isChangeMeasure,
  isForecastStatus,
  type DaylightEvent,
  type DaylightFact,
  type FactMeasure,
  type FactWhy,
  type RecordFact,
} from "../shared/facts.ts";

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

type Named = Pick<RecordFact, "period" | "from" | "date"> &
  Partial<Pick<RecordFact, "measure">>;

/** What the site needs of a fact to make a sentence of it. */
export type Phrased = Named &
  Pick<
    RecordFact,
    "status" | "text" | "measure" | "direction" | "comparison"
  > & {
    why: Pick<FactWhy, "value" | "forecast">;
  };

/**
 * A night named by the evening it starts, mid-sentence: "last night", "tonight", "Thursday
 * night", "the night of 2 November". A minimum is for the 24 hours to 9am, so the night
 * that ends on `date`.
 */
export function nightName(date: string, today: string): string {
  const evening = addDays(date, -1);
  const offset = daysFrom(today, evening);
  if (offset === 0) return "tonight";
  if (offset === -1) return "last night";
  if (offset === 1) return "tomorrow night";
  const name = dayName(evening, today);
  return Math.abs(offset) <= 6 ? `${name} night` : `the night of ${name}`;
}

/** What a fact is about, named mid-sentence: "today", "last night", "the 3 days to Tuesday", "November so far". */
export function periodName(
  { period, from, date, measure }: Named,
  today: string,
): string {
  const start = parse(from);
  switch (period.kind) {
    case "day":
      if (measure === "minTemp") return nightName(date, today);
      if (measure === "rain") {
        return `the 24 hours to 9am ${dayName(date, today)}`;
      }
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
      return String(start.year);
  }
}

function addDays(date: string, days: number): string {
  return new Date((utcDay(parse(date)) + days) * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// A night, the rain to 9am and a 9am reading are over by the time the page names them.
const overByMorning = new Set<FactMeasure>([
  "minTemp",
  "rain",
  "temp9am",
  "relHum9am",
]);

function verb(fact: Phrased, today: string): string {
  const plural = fact.period.kind === "rolling" || isRainDay(fact);
  if (fact.status === "forecast") {
    return `${plural ? "are" : "is"} forecast to be`;
  }
  const ongoing =
    "toDate" in fact.period
      ? fact.period.toDate
      : overByMorning.has(fact.measure)
        ? fact.date > today
        : fact.date >= today;
  if (isHad(fact)) return ongoing ? "has" : "had";
  if (hasNights(fact)) {
    if (!ongoing) return "had";
    return fact.period.kind === "year" ? "has so far had" : "has had";
  }
  if (ongoing) return plural ? "are" : "is";
  return plural ? "were" : "was";
}

// A day can be "the hottest day", but it has "the lowest peak humidity" or "the coldest 9am".
function isHad({ measure, direction, period }: Phrased): boolean {
  if (period.kind !== "day") return false;
  if (isChangeMeasure(measure)) return true;
  switch (measure) {
    case "maxTemp":
    case "minTemp":
    case "rain":
    case "solar":
      return false;
    case "minRelHum":
      return direction === "lowest";
    default:
      return true;
  }
}

// "October had the warmest nights since 2019", but "was the month with the warmest nights".
function hasNights({ period, measure, comparison }: Phrased): boolean {
  if (measure !== "minTemp") return false;
  if (period.kind === "day" || period.kind === "rolling") return false;
  return !(period.kind === "month" && comparison === "all");
}

function isRainDay({ period, measure }: Phrased): boolean {
  return period.kind === "day" && measure === "rain";
}

const decimal = new Intl.NumberFormat("en-AU", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const whole = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 1 });

const units: Record<FactMeasure, string> = {
  maxTemp: "°C",
  minTemp: "°C",
  rain: " mm",
  range: "°C",
  maxRelHum: "%",
  minRelHum: "%",
  solar: " MJ/m²",
  temp9am: "°C",
  relHum9am: "%",
  temp3pm: "°C",
  relHum3pm: "%",
  maxTempChange: "°C",
  minTempChange: "°C",
};

const isHumidity = (measure: FactMeasure) => units[measure] === "%";

/** A value with its unit: "23.6°C", "49.6 mm", "79%". Forecasts are whole degrees, so they stay that way. */
export function amount(
  measure: FactMeasure,
  value: number,
  forecast = false,
): string {
  const format = forecast || isHumidity(measure) ? whole : decimal;
  return `${format.format(Math.abs(value))}${units[measure]}`;
}

function valueClause({ measure, period, direction, status, why }: Phrased) {
  const value = amount(measure, why.value, isForecastStatus(status));
  if (period.kind !== "day" && period.kind !== "rolling") {
    if (measure === "maxTemp") return `with an average top of ${value}`;
    if (measure === "minTemp") return `with an average low of ${value}`;
  }
  if (isChangeMeasure(measure)) {
    return `${direction === "highest" ? "up" : "down"} ${value}`;
  }
  switch (measure) {
    case "maxTemp":
      return `with a top of ${value}`;
    case "minTemp":
      return `with a low of ${value}`;
    case "rain":
      return `with ${value}`;
    case "minRelHum":
      if (direction === "highest") return `never below ${value}`;
  }
  return `at ${value}`;
}

// "A low of 10°C tonight (forecast 12°C) would make it…"
function conditional(fact: Phrased, today: string): Sentence {
  const { measure, why } = fact;
  const forecast = why.forecast ?? why.value;
  const needs = amount(measure, why.value, true);
  const what =
    measure === "maxTemp"
      ? `A top of ${needs}`
      : measure === "minTemp"
        ? `A low of ${needs}`
        : needs;
  const when = periodName(fact, today);
  const preposition =
    fact.period.kind === "rolling"
      ? "in "
      : /^(today|tomorrow|tonight|last night|tomorrow night)$/.test(when)
        ? ""
        : "on ";
  const them = fact.period.kind === "rolling" ? "them" : "it";
  return {
    before: `${what} ${preposition}`,
    subject: when,
    after: ` (forecast ${amount(measure, forecast, true)}) would make ${them} ${fact.text}`,
  };
}

/**
 * A sentence in three parts, so the site can set the day or period apart: "Last night" +
 * " was the coldest night since 15 October, with a low of 11.6°C".
 */
export interface Sentence {
  before: string;
  subject: string;
  after: string;
}

/** A fact as a sentence for the viewer's today, without its full stop. */
export function sentence(fact: Phrased, today: string): Sentence {
  if (fact.status === "conditional") return conditional(fact, today);
  return {
    before: "",
    subject: capitalise(periodName(fact, today)),
    after: ` ${verb(fact, today)} ${fact.text}, ${valueClause(fact)}`,
  };
}

const clockFormat = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  hour: "numeric",
  minute: "2-digit",
  hourCycle: "h12",
});

/** An instant as Sydney's clocks show it: "5:41am", "8:10pm". */
export function clockTime(instant: string): string {
  const parts = clockFormat.formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${part("hour")}:${part("minute")}${part("dayPeriod").toLowerCase()}`;
}

function count(n: number, unit: string): string {
  return `${String(n)} ${unit}${n === 1 ? "" : "s"}`;
}

/** A length of time in words: "14 hours 25 minutes", "10 hours". */
export function duration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [
    hours === 0 ? "" : count(hours, "hour"),
    rest === 0 ? "" : count(rest, "minute"),
  ]
    .filter((words) => words !== "")
    .join(" ");
}

function daylightValue({ event, sunrise, sunset }: DaylightFact): string {
  switch (event) {
    case "earliestSunrise":
    case "latestSunrise":
      return `at ${clockTime(sunrise)}`;
    case "earliestSunset":
    case "latestSunset":
      return `at ${clockTime(sunset)}`;
    case "longestDay":
    case "shortestDay": {
      const minutes = (Date.parse(sunset) - Date.parse(sunrise)) / 60_000;
      return `with ${duration(Math.round(minutes))} of daylight`;
    }
  }
}

// A day is the longest, but it has the earliest sunrise.
const isDayLength = (event: DaylightEvent) =>
  event === "longestDay" || event === "shortestDay";

/**
 * A turning point in the daylight as a sentence for the viewer's today, without its full
 * stop: "Today is the longest day of the year, with 14 hours 25 minutes of daylight".
 */
export function daylightSentence(fact: DaylightFact, today: string): Sentence {
  const [present, past] = isDayLength(fact.event)
    ? ["is", "was"]
    : ["has", "had"];
  const verb = fact.date >= today ? present : past;
  return {
    before: "",
    subject: capitalise(dayName(fact.date, today)),
    after: ` ${verb} ${fact.text}, ${daylightValue(fact)}`,
  };
}
