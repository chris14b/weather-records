import { describe, expect, test } from "vitest";
import type { CandidateFact } from "../src/pipeline/candidates.ts";
import { generateDailyFacts } from "../src/pipeline/daily-facts.ts";
import { addDays } from "../src/pipeline/dates.ts";
import { layerRecent } from "../src/pipeline/layering.ts";
import {
  changeSeries,
  layeredSeries,
  type Series,
} from "../src/pipeline/series.ts";
import { loadLocationHistory } from "../src/pipeline/stations.ts";
import type {
  Comparison,
  Direction,
  FactMeasure,
} from "../src/shared/facts.ts";
import { locations } from "../src/shared/locations.ts";

/** A series of consecutive days from `from`, where null is a missing day. */
function series(
  from: string,
  values: readonly (number | null)[],
  measure: FactMeasure = "maxTemp",
): Series {
  return {
    measure,
    days: values.flatMap((value, index) =>
      value === null
        ? []
        : [{ date: addDays(from, index), value, status: "confirmed" as const }],
    ),
    fullRecord: true,
  };
}

function factsFor(
  input: Series | Series[],
  windowEnd: string,
  windowDays = 31,
): CandidateFact[] {
  return generateDailyFacts({
    locationId: "test",
    series: Array.isArray(input) ? input : [input],
    windowEnd,
    windowDays,
  });
}

function find(
  facts: readonly CandidateFact[],
  date: string,
  comparison: Comparison = "all",
  direction: Direction = "highest",
): CandidateFact {
  const fact = facts.find(
    (f) =>
      f.date === date &&
      f.comparison === comparison &&
      f.direction === direction,
  );
  if (fact === undefined) {
    throw new Error(`No ${comparison} ${direction} fact for ${date}`);
  }
  return fact;
}

describe("generateDailyFacts", () => {
  test("ranks a day among every earlier day", () => {
    const facts = factsFor(
      series("2026-01-01", [30, 35, 28, 33]),
      "2026-01-04",
    );

    expect(find(facts, "2026-01-04")).toMatchObject({
      locationId: "test",
      measure: "maxTemp",
      value: 33,
      status: "confirmed",
      rank: 2,
      ties: 0,
      compared: 4,
      since: { date: "2026-01-02", value: 35 },
      recordStart: "2026-01-01",
      fullRecord: true,
    });
    expect(find(facts, "2026-01-04", "all", "lowest")).toMatchObject({
      rank: 3,
      since: { date: "2026-01-03", value: 28 },
    });
  });

  test("gives a day that beats every earlier day rank 1 and no since", () => {
    const facts = factsFor(series("2026-01-01", [30, 35, 36]), "2026-01-03");

    expect(find(facts, "2026-01-03")).toMatchObject({
      rank: 1,
      ties: 0,
      since: null,
      comparedSince: 3,
    });
  });

  test("gives tied values the same rank, and counts both as beating the next value", () => {
    const facts = factsFor(
      series("2026-01-01", [30, 32, 32, 31]),
      "2026-01-04",
    );

    expect(find(facts, "2026-01-03")).toMatchObject({
      rank: 1,
      ties: 1,
      since: { date: "2026-01-02", value: 32 },
    });
    expect(find(facts, "2026-01-04")).toMatchObject({ rank: 3, ties: 0 });
  });

  test("takes since from the most recent earlier day that matched or beat the value", () => {
    const facts = factsFor(
      series("2026-01-01", [40, 39, 20, 38, 21, 22, 38]),
      "2026-01-07",
    );

    expect(find(facts, "2026-01-07")).toMatchObject({
      since: { date: "2026-01-04", value: 38 },
      comparedSince: 3,
    });
  });

  test("ranks a day without the days after it, and records the first later day that beat it", () => {
    const facts = factsFor(
      series("2026-01-01", [30, 35, 34, 37, 38]),
      "2026-01-05",
    );

    expect(find(facts, "2026-01-02")).toMatchObject({
      rank: 1,
      compared: 2,
      beatenBy: { date: "2026-01-04", value: 37 },
    });
    expect(find(facts, "2026-01-05")).toMatchObject({
      rank: 1,
      beatenBy: null,
    });
  });

  test("doesn't count a later day that only equals it as beating it", () => {
    const facts = factsFor(series("2026-01-01", [30, 35, 35]), "2026-01-03");

    expect(find(facts, "2026-01-02").beatenBy).toBeNull();
  });

  test("makes facts only for days in the window, and ignores days after it", () => {
    const facts = factsFor(
      series("2026-01-01", [30, 31, 32, 33, 34]),
      "2026-01-04",
      2,
    );

    expect([...new Set(facts.map(({ date }) => date))]).toEqual([
      "2026-01-03",
      "2026-01-04",
    ]);
    expect(find(facts, "2026-01-04").beatenBy).toBeNull();
  });

  test("makes facts for every comparison and direction", () => {
    const facts = factsFor(series("2026-01-01", [30]), "2026-01-01");

    expect(
      facts.map(({ comparison, direction }) => `${comparison} ${direction}`),
    ).toEqual(
      expect.arrayContaining([
        "all highest",
        "all lowest",
        "year highest",
        "year lowest",
        "season highest",
        "season lowest",
        "month highest",
        "month lowest",
        "calendarDate highest",
        "calendarDate lowest",
      ]),
    );
    expect(facts).toHaveLength(10);
  });

  describe("comparisons", () => {
    const days: Series = {
      measure: "maxTemp",
      days: (
        [
          ["2024-01-15", 40],
          ["2024-12-01", 39],
          ["2025-01-15", 38],
          ["2025-02-20", 37],
          ["2025-03-01", 41],
          ["2026-01-02", 36],
          ["2026-01-15", 35],
        ] as const
      ).map(([date, value]) => ({ date, value, status: "confirmed" as const })),
      fullRecord: true,
    };
    const facts = factsFor(days, "2026-01-15");

    test.each([
      ["all", 7, 7, "2026-01-02"],
      ["year", 2, 2, "2026-01-02"],
      ["season", 6, 6, "2026-01-02"],
      ["month", 4, 4, "2026-01-02"],
      ["calendarDate", 3, 3, "2025-01-15"],
    ] as const)("compares %s days", (comparison, compared, rank, sinceDate) => {
      expect(find(facts, "2026-01-15", comparison)).toMatchObject({
        compared,
        rank,
        since: { date: sinceDate },
      });
    });

    test("counts December in the same summer as January and February", () => {
      expect(find(facts, "2026-01-02", "season").compared).toBe(5);
    });

    test("compares a night for the calendar date with the nights of the same evening", () => {
      const nights: Series = {
        measure: "minTemp",
        days: (
          [
            ["2024-02-29", 18],
            ["2024-03-01", 15],
            ["2025-03-01", 17],
          ] as const
        ).map(([date, value]) => ({
          date,
          value,
          status: "confirmed" as const,
        })),
        fullRecord: true,
      };
      const nightOf28February = find(
        factsFor(nights, "2025-03-01"),
        "2025-03-01",
        "calendarDate",
        "lowest",
      );

      expect(nightOf28February).toMatchObject({
        compared: 2,
        rank: 1,
        since: null,
      });
    });
  });

  describe("missing days", () => {
    const withGaps = series("2026-03-01", [
      20,
      ...Array<null>(10).fill(null),
      21,
      null,
      null,
      22,
      ...Array<null>(20).fill(null),
      23,
      24,
    ]);
    const facts = factsFor(withGaps, "2026-04-06", 2);

    test("counts the comparable days before the day that have no value", () => {
      expect(find(facts, "2026-04-06").missingDays).toBe(32);
      expect(find(facts, "2026-04-06", "month").missingDays).toBe(4);
      expect(find(facts, "2026-04-06", "calendarDate").missingDays).toBe(0);
    });

    test("lists runs of at least a week of missing days that include a comparable day", () => {
      expect(find(facts, "2026-04-06").gaps).toEqual([
        { from: "2026-03-02", to: "2026-03-11" },
        { from: "2026-03-16", to: "2026-04-04" },
      ]);
      expect(find(facts, "2026-04-06", "month").gaps).toEqual([
        { from: "2026-03-16", to: "2026-04-04" },
      ]);
      expect(find(facts, "2026-04-06", "calendarDate").gaps).toEqual([]);
    });
  });

  test("makes only wettest facts for rain, and none for a dry day", () => {
    const facts = factsFor(
      series("2026-01-01", [0, 5.2, 0], "rain"),
      "2026-01-03",
    );

    expect(new Set(facts.map(({ date }) => date))).toEqual(
      new Set(["2026-01-02"]),
    );
    expect(new Set(facts.map(({ direction }) => direction))).toEqual(
      new Set(["highest"]),
    );
  });

  test("makes only biggest-rise facts for a rise, biggest-drop facts for a drop, and none for no change", () => {
    const facts = factsFor(
      series("2026-01-01", [2.5, -14.9, 0], "maxTempChange"),
      "2026-01-03",
    );

    expect(
      new Set(facts.map(({ date, direction }) => `${date} ${direction}`)),
    ).toEqual(new Set(["2026-01-01 highest", "2026-01-02 lowest"]));
  });

  test("passes on each day's status and the series' record start", () => {
    const humidity: Series = {
      measure: "minRelHum",
      days: [
        { date: "2026-01-01", value: 40, status: "confirmed" },
        { date: "2026-01-02", value: 45, status: "provisional" },
      ],
      fullRecord: false,
    };

    expect(find(factsFor(humidity, "2026-01-02"), "2026-01-02")).toMatchObject({
      measure: "minRelHum",
      status: "provisional",
      recordStart: "2026-01-01",
      fullRecord: false,
    });
  });

  test("makes facts for each series separately", () => {
    const facts = factsFor(
      [
        series("2026-01-01", [30, 31]),
        series("2026-01-01", [10, 9], "minTemp"),
      ],
      "2026-01-02",
      1,
    );

    expect(new Set(facts.map(({ measure }) => measure))).toEqual(
      new Set(["maxTemp", "minTemp"]),
    );
    expect(
      facts.find(
        (f) =>
          f.measure === "minTemp" &&
          f.comparison === "all" &&
          f.direction === "lowest",
      )?.rank,
    ).toBe(1);
  });

  describe("at Observatory Hill", async () => {
    const [observatoryHill] = locations;
    if (observatoryHill === undefined) throw new Error("No locations");
    const history = await loadLocationHistory(
      "data/raw",
      observatoryHill,
      "maxTemp",
    );
    const maxTemp = layeredSeries(
      "maxTemp",
      layerRecent("maxTemp", history, []),
    );

    test("finds the hottest day on record on 2013-01-18", () => {
      const facts = factsFor(maxTemp, "2013-01-18", 1);

      expect(find(facts, "2013-01-18")).toMatchObject({
        locationId: "test",
        value: 45.8,
        status: "confirmed",
        rank: 1,
        ties: 0,
        since: null,
        recordStart: "1859-01-01",
        fullRecord: true,
      });
    });

    test("finds the 14.9°C drop in maximum on 2026-10-13", () => {
      const facts = factsFor(changeSeries(maxTemp), "2026-10-13", 1);

      expect(find(facts, "2026-10-13", "month", "lowest")).toMatchObject({
        measure: "maxTempChange",
        value: -14.9,
        ties: 2,
        since: { date: "2017-10-31", value: -14.9 },
      });
      expect(find(facts, "2026-10-13", "calendarDate", "lowest").rank).toBe(1);
    });
  });
});
