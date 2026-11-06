import { describe, expect, test } from "vitest";
import { generateDailyFacts } from "../src/pipeline/daily-facts.ts";
import { addDays, daysBetween } from "../src/pipeline/dates.ts";
import { readSavedSeries } from "../src/pipeline/saved-series.ts";
import { selectFacts } from "../src/pipeline/selection.ts";
import { changeSeries, type Series } from "../src/pipeline/series.ts";
import type { Fact, FactMeasure, LocationFacts } from "../src/shared/facts.ts";
import { locations } from "../src/shared/locations.ts";

const latest = "2026-11-06";

/** Every day from 2016 to `latest` at `baseline`, except the days given. */
function series<Measure extends FactMeasure>(
  measure: Measure,
  baseline: (date: string) => number,
  values: Readonly<Record<string, number>>,
): Series<Measure> {
  const days = Array.from(
    { length: daysBetween("2016-01-01", latest) + 1 },
    (_, index) => {
      const date = addDays("2016-01-01", index);
      return {
        date,
        value: values[date] ?? baseline(date),
        status: "confirmed" as const,
      };
    },
  );
  return { measure, days, fullRecord: true };
}

const maxTemps = {
  "2026-10-17": 24,
  "2026-11-03": 25,
  "2026-11-04": 26,
  "2026-11-06": 30,
};
// A wet 15th of every month keeps small falls far from the top ranks.
const rain = series("rain", (date) => (date.endsWith("-15") ? 100 : 0), {
  "2026-10-27": 5,
  "2026-11-03": 4,
  "2026-11-04": 150,
  "2026-11-06": 200,
});
const allSeries = [
  series("maxTemp", () => 20, maxTemps),
  series("temp3pm", () => 20, maxTemps),
  rain,
];
const selected = selectFacts({
  locationId: "test",
  facts: generateDailyFacts({
    locationId: "test",
    series: allSeries,
    windowEnd: latest,
  }),
  series: allSeries,
});

const summary = (facts: readonly Fact[]) =>
  facts.map(({ date, measure, text }) => ({ date, measure, text }));

describe("selectFacts", () => {
  test("puts the latest day's strongest facts in today", () => {
    expect(selected.locationId).toBe("test");
    expect(summary(selected.today)).toEqual([
      {
        date: "2026-11-06",
        measure: "maxTemp",
        text: "the hottest day on record",
      },
      {
        date: "2026-11-06",
        measure: "rain",
        text: "the wettest day on record",
      },
    ]);
  });

  test("gives each of the 6 days before it up to two facts, latest first, needing more for the second", () => {
    expect(summary(selected.thisWeek)).toEqual([
      {
        date: "2026-11-04",
        measure: "maxTemp",
        text: "the hottest day on record, until Friday",
      },
      {
        date: "2026-11-04",
        measure: "rain",
        text: "the wettest day on record, until Friday",
      },
      {
        date: "2026-11-03",
        measure: "maxTemp",
        text: "the hottest day on record, until Wednesday",
      },
    ]);
  });

  test("keeps only strong facts from 7 to 30 days before it", () => {
    expect(summary(selected.thisMonth)).toEqual([
      {
        date: "2026-10-17",
        measure: "maxTemp",
        text: "the hottest day on record, until 3 November",
      },
    ]);
  });

  test("keeps the strongest of a day's facts about the same family of measures and direction", () => {
    const [hottest] = selected.today;

    expect(hottest).toMatchObject({
      measure: "maxTemp",
      direction: "highest",
      comparison: "all",
      status: "confirmed",
      lead: "rank",
    });
    expect(hottest?.score).toBeCloseTo(
      Math.log(3963) * Math.cbrt(10.85 / 30),
      1,
    );
  });

  test("explains a fact with its value, the previous record and the leaders", () => {
    const why = selected.today[0]?.why;

    expect(why).toMatchObject({
      value: 30,
      rank: 1,
      ties: 0,
      compared: 3963,
      recordStart: "2016-01-01",
      fullRecord: true,
      missingDays: 0,
      gaps: [],
      record: { date: "2026-11-04", value: 26 },
      since: null,
      beatenBy: null,
    });
    expect(why?.leaders).toEqual([
      { date: "2026-11-06", value: 30, rank: 1 },
      { date: "2026-11-04", value: 26, rank: 2 },
      { date: "2026-11-03", value: 25, rank: 3 },
      { date: "2026-10-17", value: 24, rank: 4 },
      ...["01", "02", "03", "04", "05", "06"].map((day) => ({
        date: `2016-01-${day}`,
        value: 20,
        rank: 5,
      })),
    ]);
  });

  test("keeps one change in temperature per day, apart from the day's other temperature facts", () => {
    const max = series("maxTemp", () => 25, {
      "2026-11-05": 35,
      "2026-11-06": 15,
    });
    const min = series("minTemp", () => 15, {
      "2026-11-05": 18,
      "2026-11-06": 8,
    });
    const coldChange = [max, changeSeries(max), changeSeries(min)];

    const { today } = selectFacts({
      locationId: "test",
      facts: generateDailyFacts({
        locationId: "test",
        series: coldChange,
        windowEnd: latest,
      }),
      series: coldChange,
    });

    expect(today.map(({ measure, text }) => ({ measure, text }))).toEqual([
      { measure: "maxTemp", text: "the coldest day on record" },
      {
        measure: "maxTempChange",
        text: "the biggest day-to-day drop in maximum temperature on record",
      },
    ]);
  });

  test("has empty sections when there are no facts", () => {
    expect(selectFacts({ locationId: "test", facts: [], series: [] })).toEqual({
      locationId: "test",
      today: [],
      thisWeek: [],
      thisMonth: [],
    });
  });
});

describe("selectFacts on real data", () => {
  const sections = (facts: LocationFacts) =>
    Object.fromEntries(
      (["today", "thisWeek", "thisMonth"] as const).map((section) => [
        section,
        facts[section].map(
          ({ date, score, text }) => `${date} ${score.toFixed(2)} ${text}`,
        ),
      ]),
    );

  test.each([
    ["sydney-observatory-hill", "2013-01-18"],
    ["sydney-observatory-hill", "1986-08-08"],
    ["sydney-observatory-hill", "2026-10-13"],
    ["sydney-airport", "2026-10-29"],
    ["sydney-olympic-park", "2020-02-12"],
  ])("chooses the facts at %s for the 31 days to %s", async (id, windowEnd) => {
    const location = locations.find((l) => l.id === id);
    if (location === undefined) throw new Error(`No location ${id}`);
    const locationSeries = await readSavedSeries(location);

    const facts = selectFacts({
      locationId: id,
      facts: generateDailyFacts({
        locationId: id,
        series: locationSeries,
        windowEnd,
      }),
      series: locationSeries,
    });

    expect(sections(facts)).toMatchSnapshot();
  });
});
