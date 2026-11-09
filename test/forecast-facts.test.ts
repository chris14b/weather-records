import { describe, expect, test } from "vitest";
import type { CandidateFact } from "../src/pipeline/candidates.ts";
import { addDays, daysBetween } from "../src/pipeline/dates.ts";
import type { ForecastDay } from "../src/pipeline/forecast.ts";
import {
  forecastStart,
  generateForecastFacts,
} from "../src/pipeline/forecast-facts.ts";
import type { Series } from "../src/pipeline/series.ts";
import type { Comparison, FactMeasure } from "../src/shared/facts.ts";

/** Every day from 2016 to `to` at `baseline`, except the days given. */
function series(
  measure: FactMeasure,
  to: string,
  baseline: number,
  values: Readonly<Record<string, number>> = {},
): Series {
  const days = Array.from(
    { length: daysBetween("2016-01-01", to) + 1 },
    (_, index) => {
      const date = addDays("2016-01-01", index);
      return {
        date,
        value: values[date] ?? baseline,
        status: "confirmed" as const,
      };
    },
  );
  return { measure, days, fullRecord: true };
}

/** A 7-day forecast from 2026-11-06, dry and mild unless changed. */
function forecastDays(
  changes: Readonly<Record<number, Partial<ForecastDay>>> = {},
): ForecastDay[] {
  return Array.from({ length: 7 }, (_, index) => ({
    date: addDays("2026-11-06", index),
    minTemp: index === 0 ? null : 15,
    maxTemp: 20,
    rainChance: 0,
    rain50: null,
    rain25: null,
    iconCode: null,
    precis: null,
    ...changes[index],
  }));
}

function factsFor(
  allSeries: readonly Series[],
  days: readonly ForecastDay[],
  from = "2026-11-06",
): CandidateFact[] {
  return generateForecastFacts({
    locationId: "test",
    series: allSeries,
    forecast: { days, from },
  });
}

function find(
  facts: readonly CandidateFact[],
  {
    date,
    status = "forecast",
    comparison = "all",
    direction = "highest",
  }: Partial<CandidateFact> & { comparison?: Comparison },
): CandidateFact | undefined {
  return facts.find(
    (fact) =>
      (date === undefined || fact.date === date) &&
      fact.status === status &&
      fact.comparison === comparison &&
      fact.direction === direction,
  );
}

const runs = (facts: readonly CandidateFact[]) =>
  facts.filter(({ period }) => period.kind === "rolling");

const maxTemps = (values: Readonly<Record<string, number>> = {}) =>
  series("maxTemp", "2026-11-05", 20, values);

describe("forecastStart", () => {
  test.each([
    ["8:30am, with daylight saving", "2026-11-05T21:30:00Z", "2026-11-06"],
    ["8:59pm, with daylight saving", "2026-11-06T09:59:00Z", "2026-11-06"],
    ["9pm, with daylight saving", "2026-11-06T10:00:00Z", "2026-11-07"],
    ["10:30pm, with daylight saving", "2026-11-06T11:30:00Z", "2026-11-07"],
    ["8:59pm, without daylight saving", "2026-06-06T10:59:00Z", "2026-06-06"],
    ["9pm, without daylight saving", "2026-06-06T11:00:00Z", "2026-06-07"],
  ])("at %s (%s) is %s", (_, now, expected) => {
    expect(forecastStart(new Date(now))).toBe(expected);
  });
});

describe("generateForecastFacts", () => {
  test("ranks a forecast maximum against the observed days", () => {
    const facts = factsFor([maxTemps()], forecastDays({ 1: { maxTemp: 30 } }));

    expect(find(facts, { date: "2026-11-07" })).toMatchObject({
      measure: "maxTemp",
      value: 30,
      period: { kind: "day" },
      rank: 1,
      compared: daysBetween("2016-01-01", "2026-11-05") + 3,
      beatenBy: null,
    });
  });

  test("ranks a forecast minimum, from the first day that has one", () => {
    const facts = factsFor(
      [series("minTemp", "2026-11-06", 15)],
      forecastDays({ 2: { minTemp: 5 } }),
    );

    expect(facts.some(({ date }) => date === "2026-11-06")).toBe(false);
    expect(
      find(facts, { date: "2026-11-08", direction: "lowest" }),
    ).toMatchObject({ measure: "minTemp", value: 5, rank: 1 });
  });

  test("compares a forecast day with the forecast's earlier days too", () => {
    const facts = factsFor(
      [maxTemps()],
      forecastDays({
        1: { maxTemp: 38 },
        2: { maxTemp: 37 },
        3: { maxTemp: 39 },
      }),
    );

    expect(find(facts, { date: "2026-11-08" })).toMatchObject({
      rank: 2,
      since: { date: "2026-11-07", value: 38 },
      comparedSince: 1,
    });
    expect(find(facts, { date: "2026-11-07" })?.beatenBy).toEqual({
      date: "2026-11-09",
      value: 39,
    });
  });

  test("gives temperature facts from the day it starts at", () => {
    const days = forecastDays();
    const dates = (from: string) =>
      new Set(
        factsFor([maxTemps()], days, from)
          .filter(({ status }) => status === "forecast")
          .map(({ date }) => date),
      );

    expect(dates("2026-11-06").has("2026-11-06")).toBe(true);
    expect(dates("2026-11-07").has("2026-11-06")).toBe(false);
    expect(dates("2026-11-07").has("2026-11-07")).toBe(true);
  });

  test("leaves out days the series already has", () => {
    const facts = factsFor(
      [series("maxTemp", "2026-11-06", 20)],
      forecastDays({ 0: { maxTemp: 40 } }),
    );

    expect(facts.some(({ date }) => date === "2026-11-06")).toBe(false);
  });

  describe("what it would take", () => {
    const observed = maxTemps({ "2018-01-10": 31, "2020-01-10": 34.5 });

    test("finds the least value within reach that gets the most notable rank", () => {
      const facts = factsFor([observed], forecastDays({ 1: { maxTemp: 33 } }));

      expect(find(facts, { date: "2026-11-07" })).toMatchObject({
        value: 33,
        rank: 2,
        since: { date: "2020-01-10", value: 34.5 },
      });
      expect(
        find(facts, { date: "2026-11-07", status: "conditional" }),
      ).toMatchObject({
        value: 34.6,
        forecast: 33,
        rank: 1,
        ties: 0,
        since: null,
        beatenBy: null,
      });
    });

    test("reaches no more than 2°C beyond the forecast", () => {
      const facts = factsFor([observed], forecastDays({ 1: { maxTemp: 32 } }));

      expect(
        facts.filter(
          ({ date, status, direction }) =>
            date === "2026-11-07" &&
            status === "conditional" &&
            direction === "highest",
        ),
      ).toEqual([]);
    });

    test("reaches down as well as up", () => {
      const facts = factsFor(
        [maxTemps({ "2025-07-01": 12, "2024-07-01": 11.5 })],
        forecastDays({ 1: { maxTemp: 13 } }),
      );

      expect(
        find(facts, {
          date: "2026-11-07",
          status: "conditional",
          direction: "lowest",
        }),
      ).toMatchObject({ value: 11.4, forecast: 13, rank: 1 });
    });
  });

  describe("rain over the next 7 days", () => {
    const observed = series("rain", "2026-11-06", 0, {
      "2020-02-08": 30,
      "2020-02-09": 30,
      "2020-02-10": 30,
    });
    const noRange = { rain50: null, rain25: null };
    const wetWeek = (
      changes: Readonly<Record<number, Partial<ForecastDay>>> = {},
    ) =>
      forecastDays(
        Object.fromEntries(
          Array.from({ length: 7 }, (_, index) => [
            index,
            { rainChance: 80, rain50: 10, rain25: 20, ...changes[index] },
          ]),
        ),
      );

    test("totals the amounts with a 50% chance, each counted towards the next day", () => {
      const facts = runs(factsFor([observed], wetWeek()));

      expect(find(facts, {})).toMatchObject({
        from: "2026-11-07",
        date: "2026-11-13",
        period: { kind: "rolling", days: 7 },
        measure: "rain",
        value: 70,
        rank: 2,
        since: { date: "2020-02-14", value: 90 },
      });
    });

    test("finds what it would take, up to the amounts with a 25% chance", () => {
      const facts = runs(factsFor([observed], wetWeek()));

      expect(find(facts, { status: "conditional" })).toMatchObject({
        value: 90.1,
        forecast: 70,
        rank: 1,
        since: null,
      });
    });

    test("counts a day with a low chance and no rain range as 0 mm", () => {
      const days = wetWeek({ 0: { ...noRange, rainChance: 10 } });

      expect(find(runs(factsFor([observed], days)), {})?.value).toBe(60);
    });

    test("counts a day with a chance below 50% and no rain range as 0 mm, with nothing it could reach", () => {
      const facts = runs(
        factsFor([observed], wetWeek({ 3: { ...noRange, rainChance: 40 } })),
      );

      expect(find(facts, {})?.value).toBe(60);
      expect(find(facts, { status: "conditional" })).toBeUndefined();
    });

    test.each([
      ["no rain range and a chance of 50% or more", { rainChance: 60 }],
      ["no chance of rain either", { rainChance: null }],
    ])("gives no total when a day has %s", (_, change) => {
      const days = wetWeek({ 3: { ...noRange, ...change } });

      expect(runs(factsFor([observed], days))).toEqual([]);
    });

    test("gives no total for a dry week or a short forecast", () => {
      expect(factsFor([observed], forecastDays())).toEqual([]);
      expect(runs(factsFor([observed], wetWeek().slice(0, 6)))).toEqual([]);
    });
  });

  describe("rain on each day", () => {
    const observed = series("rain", "2026-11-06", 0, { "2020-02-08": 30 });
    const wetDay = (change: Partial<ForecastDay>) =>
      forecastDays({
        2: { rainChance: 80, rain50: 40, rain25: 60, ...change },
      });
    const days = (facts: readonly CandidateFact[]) =>
      facts.filter(({ period }) => period.kind === "day");

    test("ranks the amount with a 50% chance as the 24 hours to 9am the next day", () => {
      const facts = days(factsFor([observed], wetDay({})));

      expect(find(facts, {})).toMatchObject({
        from: "2026-11-09",
        date: "2026-11-09",
        measure: "rain",
        value: 40,
        rank: 1,
        status: "forecast",
      });
    });

    test("ranks the amount with a 25% chance when it does better than the forecast", () => {
      const facts = days(
        factsFor([observed], wetDay({ rain50: 20, rain25: 35 })),
      );

      expect(find(facts, { status: "conditional" })).toMatchObject({
        date: "2026-11-09",
        value: 35,
        forecast: 20,
        rank: 1,
      });
    });

    test("ranks the amount with a 25% chance on a day forecast 0 mm", () => {
      const facts = days(
        factsFor([observed], wetDay({ rain50: 0, rain25: 35 })),
      );

      expect(find(facts, {})).toBeUndefined();
      expect(find(facts, { status: "conditional" })).toMatchObject({
        value: 35,
        forecast: 0,
        rank: 1,
      });
    });

    test("gives no chance when the amount with a 25% chance does no better", () => {
      const facts = days(
        factsFor([observed], wetDay({ rain50: 20, rain25: 20 })),
      );

      expect(find(facts, { status: "conditional" })).toBeUndefined();
    });

    test("starts from the day after the observed rain, whatever day the temperatures start from", () => {
      const evening = factsFor(
        [observed],
        forecastDays({ 0: { rain50: 5, rain25: 9 } }),
        "2026-11-07",
      );

      expect(days(evening)).toContainEqual(
        expect.objectContaining({ date: "2026-11-07", measure: "rain" }),
      );
    });

    test("leaves out a day with no rain range and a chance of 50% or more", () => {
      const facts = factsFor(
        [observed],
        wetDay({ rain50: null, rain25: null, rainChance: 60 }),
      );

      expect(days(facts)).toEqual([]);
    });
  });
});
