import type { DayValue, Direction } from "../shared/facts.ts";
import type { CandidateFact } from "./candidates.ts";
import { comparisonKey, generateDailyFacts, rank } from "./daily-facts.ts";
import { addDays, daysBetween, sydneyDate, sydneyHour } from "./dates.ts";
import type { ForecastDay } from "./forecast.ts";
import { rollingComparisons, runRanker } from "./period-facts.ts";
import type { Series, SeriesDay } from "./series.ts";
import { boundariesBetween, justBeyond } from "./thresholds.ts";

/** A location's forecast, and the first day whose temperatures it gives facts about. */
export interface ForecastInput {
  days: readonly ForecastDay[];
  /** From `forecastStart`. */
  from: string;
}

export interface ForecastFactsRequest {
  locationId: string;
  series: readonly Series[];
  forecast: ForecastInput;
}

/** How far beyond a forecast temperature a conditional fact may reach, in °C. */
const temperatureReach = 2;

const runDays = 7;

/**
 * BOM gives no rain range on days with a low chance of rain. Below a 25% chance, the
 * amount with a 25% chance is 0 mm, and so is the amount with a 50% chance.
 */
const noRangeChance = 25;

/** The live maximum's window closes at 9pm, so a run after that is too late for today's. */
const maxWindowCloses = 21;

/** The first day of the forecast to give temperature facts about: today until 9pm, then tomorrow. */
export function forecastStart(now: Date): string {
  const today = sydneyDate(now);
  return sydneyHour(now) < maxWindowCloses ? today : addDays(today, 1);
}

/**
 * Ranks the forecast's maximums and minimums from its start, its rain on each day, and its
 * rain over the next 7 days, against the observed days and the forecast's earlier days.
 * Each also gets a conditional fact for the most notable value within reach. See
 * docs/facts.md.
 */
export function generateForecastFacts({
  locationId,
  series,
  forecast,
}: ForecastFactsRequest): CandidateFact[] {
  return series.flatMap((source) => [
    ...dayFacts(locationId, source, forecast),
    ...(source.measure === "rain"
      ? rainFacts(locationId, source, forecast.days)
      : []),
  ]);
}

type ForecastMeasure = "maxTemp" | "minTemp";

function isForecastMeasure(measure: string): measure is ForecastMeasure {
  return measure === "maxTemp" || measure === "minTemp";
}

/**
 * A maximum, minimum or rain series with the forecast's values added after the last
 * observed day: temperatures from the forecast's start, and the rain with a 50% chance.
 * Any other series is unchanged.
 */
export function forecastSeries(
  source: Series,
  forecast: ForecastInput,
): Series {
  const observedTo = source.days.at(-1)?.date ?? "";
  const forecastDays = forecast.days.flatMap((day): SeriesDay[] => {
    const value = forecastValue(source.measure, day, forecast.from);
    return value === undefined || value.date <= observedTo
      ? []
      : [{ ...value, status: "forecast" }];
  });
  return { ...source, days: [...source.days, ...forecastDays] };
}

function forecastValue(
  measure: Series["measure"],
  day: ForecastDay,
  from: string,
): DayValue | undefined {
  if (measure === "rain") {
    const rain = forecastRain(day);
    return rain === undefined ? undefined : creditRain(day, rain.rain50);
  }
  if (!isForecastMeasure(measure) || day.date < from) return undefined;
  const value = day[measure];
  return value === null ? undefined : { date: day.date, value };
}

/** Observed rain is the 24 hours to 9am, so most of a forecast day's rain counts towards the next day's. */
function creditRain(day: ForecastDay, value: number): DayValue {
  return { date: addDays(day.date, 1), value };
}

/** How far beyond its forecast value a day's conditional fact may reach. */
function reachLimit(
  fact: CandidateFact,
  days: readonly ForecastDay[],
): number | undefined {
  if (fact.measure !== "rain") {
    return reach(fact.value, temperatureReach, fact.direction);
  }
  const day = days.find((d) => creditRain(d, 0).date === fact.date);
  return day === undefined ? undefined : forecastRain(day)?.rain25;
}

function dayFacts(
  locationId: string,
  source: Series,
  forecast: ForecastInput,
): CandidateFact[] {
  // Each day is compared with the forecast's earlier days too, as if they come true.
  const extended = forecastSeries(source, forecast);
  const forecastDays = extended.days.slice(source.days.length);
  const [first, last] = [forecastDays[0], forecastDays.at(-1)];
  if (first === undefined || last === undefined) return [];
  return generateDailyFacts({
    locationId,
    series: [extended],
    windowEnd: last.date,
    windowDays: daysBetween(first.date, last.date) + 1,
  }).flatMap((fact) => {
    const key = comparisonKey(fact.date, fact.comparison);
    const earlier = extended.days.filter(
      ({ date }) =>
        date < fact.date && comparisonKey(date, fact.comparison) === key,
    );
    const limit = reachLimit(fact, forecast.days);
    const value =
      limit === undefined
        ? undefined
        : conditionalValue(
            earlier.map((day) => day.value),
            fact.value,
            limit,
            fact.direction,
          );
    if (value === undefined) return [fact];
    return [
      fact,
      {
        ...fact,
        ...rank({ date: fact.date, value }, earlier, fact.direction),
        value,
        status: "conditional",
        beatenBy: null,
        forecast: fact.value,
      },
    ];
  });
}

/** The rain in the forecast's 7 days, credited as in `creditRain`. */
function rainFacts(
  locationId: string,
  source: Series,
  days: readonly ForecastDay[],
): CandidateFact[] {
  const first = source.days[0];
  const observedTo = source.days.at(-1)?.date ?? "";
  const ahead = days
    .filter(({ date }) => addDays(date, 1) > observedTo)
    .slice(0, runDays);
  const amounts = ahead.flatMap((day) => forecastRain(day) ?? []);
  const [from, to] = [ahead[0], ahead.at(-1)];
  if (
    first === undefined ||
    from === undefined ||
    to === undefined ||
    amounts.length < runDays
  )
    return [];
  const total = sum(amounts.map(({ rain50 }) => rain50));
  if (total === 0) return [];

  const ranker = runRanker(source, runDays);
  const run = {
    from: addDays(from.date, 1),
    date: addDays(to.date, 1),
    value: total,
  };
  return rollingComparisons.flatMap((comparison) => {
    const ranking = ranker.rank(run, comparison, "highest");
    if (ranking === undefined) return [];
    const fact: CandidateFact = {
      locationId,
      date: run.date,
      from: run.from,
      period: { kind: "rolling", days: runDays },
      measure: "rain",
      direction: "highest",
      value: total,
      status: "forecast",
      comparison,
      ...ranking,
      recordStart: first.date,
      fullRecord: source.fullRecord,
    };
    const value = conditionalValue(
      ranker.earlierValues(run.date, comparison),
      total,
      sum(amounts.map(({ rain25 }) => rain25)),
      "highest",
    );
    const conditional =
      value === undefined
        ? undefined
        : ranker.rank({ ...run, value }, comparison, "highest");
    if (value === undefined || conditional === undefined) return [fact];
    return [
      fact,
      {
        ...fact,
        ...conditional,
        value,
        status: "conditional",
        forecast: total,
      },
    ];
  });
}

function forecastRain({
  rain50,
  rain25,
  rainChance,
}: ForecastDay): { rain50: number; rain25: number } | undefined {
  if (rain50 !== null && rain25 !== null) return { rain50, rain25 };
  return rainChance !== null && rainChance < noRangeChance
    ? { rain50: 0, rain25: 0 }
    : undefined;
}

/**
 * The least value that gets the most notable rank and since within reach of the forecast,
 * or undefined if nothing within reach beats what the forecast gets.
 */
function conditionalValue(
  earlier: readonly number[],
  forecast: number,
  limit: number,
  direction: Direction,
): number | undefined {
  const furthest = boundariesBetween(earlier, forecast, limit, direction).at(
    -1,
  );
  return furthest === undefined ? undefined : justBeyond(furthest, direction);
}

function reach(value: number, by: number, direction: Direction): number {
  return direction === "highest" ? value + by : value - by;
}

function sum(values: readonly number[]): number {
  return (
    Math.round(values.reduce((total, value) => total + value, 0) * 10) / 10
  );
}
