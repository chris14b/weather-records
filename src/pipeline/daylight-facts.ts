import type { DaylightEvent, Direction } from "../shared/facts.ts";
import { type Coordinates, sunTimes } from "../shared/sun.ts";
import { sydneyOffsetMinutes } from "../shared/sydney-time.ts";
import { addDays, daysBetween } from "./dates.ts";

/** How far either side of the window's last day the page can show a turning point. */
const daylightReach = { before: 30, after: 7 };

/** A turning point in the year's daylight, before it is scored and worded. */
export interface DaylightCandidate {
  date: string;
  event: DaylightEvent;
  /** Whether it beats every other day of its calendar year, or only of its season. */
  scope: "year" | "season";
  /** Rounded to the minute, as published times are. */
  sunrise: Date;
  sunset: Date;
}

interface Day {
  date: string;
  sunrise: Date;
  sunset: Date;
}

type Measure = "sunrise" | "sunset" | "length";

const events: readonly {
  event: DaylightEvent;
  measure: Measure;
  direction: Direction;
}[] = [
  { event: "earliestSunrise", measure: "sunrise", direction: "lowest" },
  { event: "latestSunrise", measure: "sunrise", direction: "highest" },
  { event: "earliestSunset", measure: "sunset", direction: "lowest" },
  { event: "latestSunset", measure: "sunset", direction: "highest" },
  { event: "longestDay", measure: "length", direction: "highest" },
  { event: "shortestDay", measure: "length", direction: "lowest" },
];

const msPerMinute = 60_000;

function roundToMinute(instant: Date): Date {
  return new Date(Math.round(instant.getTime() / msPerMinute) * msPerMinute);
}

function day(date: string, place: Coordinates): Day {
  const times = sunTimes(date, place);
  if (times === undefined) {
    throw new Error(`The sun doesn't rise and set on ${date}`);
  }
  return { date, ...times };
}

// The sun's own time of day, unrounded and without daylight saving, so the curve is smooth.
function solarValue(measure: Measure, { date, sunrise, sunset }: Day): number {
  const midnight = Date.parse(`${date}T00:00:00Z`);
  switch (measure) {
    case "sunrise":
      return sunrise.getTime() - midnight;
    case "sunset":
      return sunset.getTime() - midnight;
    case "length":
      return sunset.getTime() - sunrise.getTime();
  }
}

// The value as it reads on Sydney's clocks, which daylight saving moves an hour.
function clockValue(measure: Measure, day: Day): number {
  if (measure === "length") return solarValue(measure, day);
  const instant = measure === "sunrise" ? day.sunrise : day.sunset;
  return solarValue(measure, day) + sydneyOffsetMinutes(instant) * msPerMinute;
}

const beats = (a: number, b: number, direction: Direction) =>
  direction === "highest" ? a > b : a < b;

export interface DaylightRequest {
  place: Coordinates;
  from: string;
  to: string;
}

/**
 * The turning points of the year's daylight from `from` to `to`: the days whose sunrise,
 * sunset or day length is further out than the day before's, and at least as far as the
 * day after's.
 */
export function generateDaylightFacts({
  place,
  from,
  to,
}: DaylightRequest): DaylightCandidate[] {
  const days = Array.from({ length: daysBetween(from, to) + 3 }, (_, index) =>
    day(addDays(from, index - 1), place),
  );
  const facts: DaylightCandidate[] = [];
  for (const [index, today] of days.entries()) {
    const before = days[index - 1];
    const after = days[index + 1];
    if (before === undefined || after === undefined) continue;
    for (const { event, measure, direction } of events) {
      const value = solarValue(measure, today);
      if (
        !beats(value, solarValue(measure, before), direction) ||
        beats(solarValue(measure, after), value, direction)
      ) {
        continue;
      }
      const scope = scopeOf(today, measure, direction, place);
      if (scope === undefined) continue;
      facts.push({
        date: today.date,
        event,
        scope,
        sunrise: roundToMinute(today.sunrise),
        sunset: roundToMinute(today.sunset),
      });
    }
  }
  return facts;
}

// Daylight saving can put another day's sunrise or sunset further out on the clock.
function scopeOf(
  turningPoint: Day,
  measure: Measure,
  direction: Direction,
  place: Coordinates,
): DaylightCandidate["scope"] | undefined {
  const value = clockValue(measure, turningPoint);
  const unbeaten = (first: string, last: string) => {
    for (let date = first; date <= last; date = addDays(date, 1)) {
      if (beats(clockValue(measure, day(date, place)), value, direction)) {
        return false;
      }
    }
    return true;
  };
  const year = turningPoint.date.slice(0, 4);
  if (unbeaten(`${year}-01-01`, `${year}-12-31`)) return "year";
  const season = seasonOf(turningPoint.date);
  return unbeaten(season.from, season.to) ? "season" : undefined;
}

/** The meteorological season a date falls in, so summer starts in December. */
function seasonOf(date: string): { from: string; to: string } {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const startYear = month <= 2 ? year - 1 : year;
  const startMonth = month <= 2 ? 12 : month - (month % 3);
  const from = `${String(startYear)}-${String(startMonth).padStart(2, "0")}-01`;
  const next = `${addDays(from, 92).slice(0, 7)}-01`;
  return { from, to: addDays(next, -1) };
}

/** The turning points from the window's start to the end of the coming week. */
export function daylightAround(
  place: Coordinates,
  windowEnd: string,
): DaylightCandidate[] {
  return generateDaylightFacts({
    place,
    from: addDays(windowEnd, -daylightReach.before),
    to: addDays(windowEnd, daylightReach.after),
  });
}
