import { describe, expect, test } from "vitest";
import type { CandidateFact } from "../src/pipeline/candidates.ts";
import { generateCandidates } from "../src/pipeline/candidates.ts";
import { addDays, daysBetween } from "../src/pipeline/dates.ts";
import type { ForecastDay } from "../src/pipeline/forecast.ts";
import type { RunningValue } from "../src/pipeline/observations.ts";
import {
  generateRunningFacts,
  withoutOvertaken,
  withoutRunning,
} from "../src/pipeline/running-facts.ts";
import { selectFacts } from "../src/pipeline/selection.ts";
import { pastYearSeries, type Series } from "../src/pipeline/series.ts";
import type { FactMeasure } from "../src/shared/facts.ts";
import { dailyFact } from "./facts.ts";

const yesterday = "2026-11-05";
const today = "2026-11-06";
const tomorrow = "2026-11-07";
const observedAt = "2026-11-06T03:30:00.000Z";

/** Every day from 2016 to yesterday at `baseline`, except the days given. */
function series(
  measure: FactMeasure,
  baseline: number,
  values: Readonly<Record<string, number>> = {},
  to = yesterday,
): Series {
  const from = "2016-01-01";
  return {
    measure,
    days: Array.from({ length: daysBetween(from, to) + 1 }, (_, index) => {
      const date = addDays(from, index);
      return { date, value: values[date] ?? baseline, status: "confirmed" };
    }),
    fullRecord: true,
  };
}

const runningValue = (
  measure: RunningValue["measure"],
  value: number,
  date = today,
): RunningValue => ({ measure, date, value, observedAt });

describe("generateRunningFacts", () => {
  test("ranks a running maximum as its day's, only as the hottest", () => {
    const facts = generateRunningFacts({
      locationId: "test",
      series: [series("maxTemp", 20, { "2026-02-10": 35 })],
      running: [runningValue("maxTemp", 30)],
    });

    expect(facts.every(({ direction }) => direction === "highest")).toBe(true);
    expect(facts.find(({ comparison }) => comparison === "all")).toMatchObject({
      date: today,
      value: 30,
      status: "partial",
      rank: 2,
      since: { date: "2026-02-10", value: 35 },
      observedAt,
    });
  });

  test("ranks a running minimum only as the coldest, and the rain since 9am only as the wettest", () => {
    const facts = generateRunningFacts({
      locationId: "test",
      series: [series("minTemp", 15), series("rain", 0, {}, today)],
      running: [runningValue("minTemp", 8), runningValue("rain", 12, tomorrow)],
    });

    expect(
      new Set(facts.map(({ measure, direction }) => `${measure} ${direction}`)),
    ).toEqual(new Set(["minTemp lowest", "rain highest"]));
    expect(
      facts.filter(({ measure }) => measure === "rain").map(({ date }) => date),
    ).toContain(tomorrow);
  });

  test("ranks the day's gust so far against the past year, only as the gustiest", () => {
    const gusts = pastYearSeries({
      ...series("gust", 40, { "2026-03-01": 90, "2026-08-20": 75 }),
    });

    const facts = generateRunningFacts({
      locationId: "test",
      series: [gusts],
      running: [runningValue("gust", 80)],
    });

    expect(
      new Set(
        facts.map(({ comparison, direction }) => `${comparison} ${direction}`),
      ),
    ).toEqual(new Set(["all highest", "year highest"]));
    expect(facts.find(({ comparison }) => comparison === "all")).toMatchObject({
      status: "partial",
      rank: 2,
      since: { date: "2026-03-01", value: 90 },
    });
  });

  test("gives nothing for no rain since 9am", () => {
    expect(
      generateRunningFacts({
        locationId: "test",
        series: [series("rain", 0, { "2026-01-01": 5 }, today)],
        running: [runningValue("rain", 0, tomorrow)],
      }),
    ).toEqual([]);
  });
});

describe("withoutRunning", () => {
  test("leaves a value still running out of the saved observations", () => {
    expect(
      withoutRunning(
        [
          {
            date: today,
            rain: 2,
            maxTemp: 28,
            minTemp: 15,
            station: "066214",
          },
        ],
        [runningValue("maxTemp", 28)],
      ),
    ).toEqual([
      { date: today, rain: 2, maxTemp: null, minTemp: 15, station: "066214" },
    ]);
  });

  test("leaves the observations alone for a running gust, which they don't hold", () => {
    const day = {
      date: today,
      rain: 2,
      maxTemp: 28,
      minTemp: 15,
      station: "066214",
    };

    expect(withoutRunning([day], [runningValue("gust", 61)])).toEqual([day]);
  });
});

describe("withoutOvertaken", () => {
  const forecastFact = (fact: Partial<CandidateFact>) =>
    dailyFact({ date: today, status: "forecast", value: 30, ...fact });
  const keep = (facts: CandidateFact[], current: number) =>
    withoutOvertaken(facts, [runningValue("maxTemp", current)]);

  test("keeps a forecast that the running value hasn't reached", () => {
    const facts = [
      forecastFact({ direction: "highest" }),
      forecastFact({ direction: "lowest" }),
    ];

    expect(keep(facts, 29)).toEqual(facts);
  });

  test("leaves out a forecast that the running value has reached", () => {
    expect(
      keep(
        [
          forecastFact({ direction: "highest" }),
          forecastFact({ direction: "lowest" }),
        ],
        30,
      ),
    ).toEqual([]);
  });

  test("keeps what it would take only while the day hasn't got there or gone past it", () => {
    const hotter = forecastFact({
      status: "conditional",
      direction: "highest",
      value: 32,
      forecast: 30,
    });
    const cooler = forecastFact({
      status: "conditional",
      direction: "lowest",
      value: 28,
      forecast: 30,
    });

    expect(keep([hotter, cooler], 27)).toEqual([hotter, cooler]);
    expect(keep([hotter, cooler], 28)).toEqual([hotter, cooler]);
    expect(keep([hotter, cooler], 29)).toEqual([hotter]);
    expect(keep([hotter, cooler], 32)).toEqual([]);
  });

  test("leaves the other days' forecasts and the observed facts alone", () => {
    const facts = [
      forecastFact({ date: tomorrow }),
      dailyFact({ date: yesterday }),
      dailyFact({ date: today, status: "partial", value: 31 }),
    ];

    expect(keep(facts, 31)).toEqual(facts);
  });
});

describe("selecting facts with running values", () => {
  const forecastDays: ForecastDay[] = [0, 1].map((offset) => ({
    date: addDays(today, offset),
    minTemp: offset === 0 ? null : 15,
    maxTemp: 34,
    rainChance: 0,
    rain50: null,
    rain25: null,
    iconCode: null,
    precis: null,
  }));

  function select(running: RunningValue[], date = today) {
    const allSeries = [
      series("maxTemp", 20, { "2026-02-10": 35, [yesterday]: 33 }),
      series("minTemp", 15),
    ];
    const forecast = { days: forecastDays, from: today };
    return selectFacts({
      date,
      facts: generateCandidates({
        locationId: "test",
        series: allSeries,
        windowEnd: today,
        forecast,
        running,
      }),
      series: allSeries,
      forecast,
    });
  }

  const shown = (facts: ReturnType<typeof select>["today"]) =>
    facts.flatMap((fact) =>
      fact.kind === "record"
        ? [{ date: fact.date, measure: fact.measure, status: fact.status }]
        : [],
    );

  test("puts a running maximum in Today, keeping yesterday's until the night is in", () => {
    const { today: todayFacts } = select([runningValue("maxTemp", 30)]);

    expect(shown(todayFacts)).toEqual(
      expect.arrayContaining([
        { date: today, measure: "maxTemp", status: "partial" },
        { date: today, measure: "maxTemp", status: "forecast" },
        { date: yesterday, measure: "maxTemp", status: "confirmed" },
      ]),
    );
    expect(
      todayFacts.find(
        (fact) => fact.kind === "record" && fact.status === "partial",
      ),
    ).toMatchObject({ observedAt });
  });

  test("drops today's forecast once the running maximum has reached it", () => {
    const { today: todayFacts } = select([runningValue("maxTemp", 34)]);

    expect(shown(todayFacts)).not.toContainEqual({
      date: today,
      measure: "maxTemp",
      status: "forecast",
    });
  });

  test("keeps a running night in Today before and after midnight, and drops it once its 9am has passed", () => {
    const night = [runningValue("minTemp", 5, tomorrow)];
    const nightFact = { date: tomorrow, measure: "minTemp", status: "partial" };

    expect(shown(select(night).today)).toContainEqual(nightFact);
    expect(shown(select(night, tomorrow).today)).toContainEqual(nightFact);
    expect(shown(select(night, addDays(tomorrow, 1)).today)).not.toContainEqual(
      nightFact,
    );
  });
});
