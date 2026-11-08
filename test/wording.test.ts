import { describe, expect, test } from "vitest";
import type { CandidateFact } from "../src/pipeline/candidates.ts";
import { describeFact, ordinal } from "../src/pipeline/wording.ts";
import type { Lead } from "../src/shared/facts.ts";
import { dailyFact, periodFact } from "./facts.ts";

const words = (fact: Partial<CandidateFact>, lead: Lead = "rank") =>
  describeFact(dailyFact(fact), lead);

describe("describeFact", () => {
  test.each([
    [{}, "the hottest day since records began in 1900"],
    [{ rank: 2 }, "the 2nd hottest day since records began in 1900"],
    [
      { rank: 3, ties: 1 },
      "the equal 3rd hottest day since records began in 1900",
    ],
    [{ ties: 2 }, "the equal hottest day since records began in 1900"],
    [{ comparison: "year" as const }, "the hottest day of the year so far"],
    [
      { comparison: "season" as const },
      "the hottest spring day since records began in 1900",
    ],
    [
      { comparison: "month" as const },
      "the hottest November day since records began in 1900",
    ],
    [
      { comparison: "calendarDate" as const },
      "the hottest 6 November since records began in 1900",
    ],
    [
      { comparison: "calendarDate" as const, measure: "minTemp" as const },
      "the warmest for the date since records began in 1900",
    ],
  ])("words a rank: %o", (fact, expected) => {
    expect(words(fact)).toBe(expected);
  });

  test.each([
    ["maxTemp", "lowest", "the coldest day"],
    ["minTemp", "highest", "the warmest"],
    ["minTemp", "lowest", "the coldest"],
    ["rain", "highest", "the wettest"],
    ["range", "lowest", "the smallest temperature range"],
    ["maxRelHum", "highest", "the highest peak humidity"],
    ["minRelHum", "highest", "the most humid day"],
    ["minRelHum", "lowest", "the lowest humidity"],
    ["solar", "highest", "the sunniest day"],
    ["solar", "lowest", "the gloomiest day"],
    ["temp9am", "lowest", "the coldest 9am"],
    ["relHum3pm", "lowest", "the driest 3pm"],
  ] as const)("words %s %s as %s", (measure, direction, expected) => {
    expect(words({ measure, direction })).toBe(
      `${expected} since records began in 1900`,
    );
  });

  test.each([
    [
      "maxTempChange",
      "lowest",
      {},
      "the biggest day-to-day drop in maximum temperature since records began in 1900",
    ],
    [
      "minTempChange",
      "highest",
      { rank: 2 },
      "the 2nd biggest day-to-day rise in minimum temperature since records began in 1900",
    ],
    [
      "minTempChange",
      "lowest",
      { comparison: "year" },
      "the biggest day-to-day drop in minimum temperature of the year so far",
    ],
    [
      "maxTempChange",
      "highest",
      { comparison: "season" },
      "the biggest day-to-day rise in maximum temperature in spring since records began in 1900",
    ],
    [
      "maxTempChange",
      "lowest",
      { comparison: "month" },
      "the biggest day-to-day drop in maximum temperature in November since records began in 1900",
    ],
    [
      "maxTempChange",
      "highest",
      { comparison: "calendarDate" },
      "the biggest day-to-day rise in maximum temperature on 6 November since records began in 1900",
    ],
    [
      "rain",
      "highest",
      { comparison: "month" },
      "the wettest in November since records began in 1900",
    ],
    [
      "rain",
      "highest",
      { comparison: "year" },
      "the wettest of the year so far",
    ],
  ] as const)(
    "words a change in %s, %s: %o",
    (measure, direction, fact, expected) => {
      expect(words({ measure, direction, ...fact })).toBe(expected);
    },
  );

  test("words a change that leads with its since", () => {
    expect(
      words(
        {
          measure: "maxTempChange",
          direction: "lowest",
          comparison: "month",
          since: { date: "2017-10-31", value: -14.9 },
        },
        "since",
      ),
    ).toBe(
      "the biggest day-to-day drop in maximum temperature in November since 2017",
    );
  });

  test("names only the year of a since in the same month, not the month again", () => {
    expect(
      words(
        {
          measure: "minTemp",
          direction: "lowest",
          comparison: "month",
          since: { date: "2024-11-03", value: 12 },
        },
        "since",
      ),
    ).toBe("the coldest in November since 2024");
  });

  test.each([
    ["1900-01-01", "since 1900"],
    ["2011-09-01", "since 2011"],
    ["2026-03-14", "since March 2026"],
  ])(
    "says since when a record started on %s, not since records began in 1900",
    (recordStart, expected) => {
      expect(words({ measure: "solar", fullRecord: false, recordStart })).toBe(
        `the sunniest day ${expected}`,
      );
    },
  );

  test.each([
    ["2026-11-02", "since 2 November"],
    ["2026-02-08", "since 8 February"],
    ["2025-12-20", "since 20 December 2025"],
    ["2024-08-30", "since August 2024"],
    ["2018-10-20", "since 2018"],
  ])("words a since on %s", (date, expected) => {
    expect(
      words(
        { measure: "range", direction: "lowest", since: { date, value: 1.2 } },
        "since",
      ),
    ).toBe(`the smallest temperature range ${expected}`);
  });

  test("leaves out the rank and the record when it leads with the since", () => {
    expect(
      words(
        {
          measure: "rain",
          comparison: "month",
          rank: 3,
          fullRecord: false,
          recordStart: "2011-08-01",
          since: { date: "2018-10-20", value: 60 },
        },
        "since",
      ),
    ).toBe("the wettest in November since 2018");
  });

  test.each(["provisional", "forecast", "conditional"] as const)(
    "leaves the %s status and what beat it to the site",
    (status) => {
      expect(
        words({
          status,
          comparison: "year",
          forecast: 38,
          beatenBy: { date: "2026-11-08", value: 41 },
        }),
      ).toBe("the hottest day of the year so far");
    },
  );

  test("names the longest gap when too many comparable days are missing", () => {
    expect(
      words({
        measure: "minRelHum",
        rank: 2,
        fullRecord: false,
        recordStart: "2009-01-01",
        compared: 5000,
        missingDays: 900,
        gaps: [
          { from: "2009-05-01", to: "2009-05-09" },
          { from: "2018-03-25", to: "2020-07-31" },
        ],
      }),
    ).toBe(
      "the 2nd most humid day since 2009 (no records from March 2018 to July 2020)",
    );
  });

  test("counts the missing days when they form no gap", () => {
    expect(words({ compared: 900, missingDays: 100 })).toBe(
      "the hottest day since records began in 1900 (with 100 days missing)",
    );
  });

  test("says nothing of a few missing days", () => {
    expect(
      words({
        missingDays: 300,
        gaps: [{ from: "1865-03-01", to: "1865-03-31" }],
      }),
    ).toBe("the hottest day since records began in 1900");
  });

  test.each([
    [{}, "the wettest since records began in 1866"],
    [{ rank: 3 }, "the 3rd wettest since records began in 1866"],
    [
      { direction: "lowest" as const },
      "the driest since records began in 1866",
    ],
    [
      { comparison: "all" as const },
      "the wettest month since records began in 1866",
    ],
    [
      { measure: "maxTemp" as const },
      "the hottest since records began in 1866",
    ],
    [
      { measure: "minTemp" as const, rank: 2, ties: 1 },
      "the equal 2nd warmest nights since records began in 1866",
    ],
    [
      {
        measure: "minTemp" as const,
        direction: "lowest" as const,
        comparison: "all" as const,
      },
      "the month with the coldest nights since records began in 1866",
    ],
    [
      {
        period: { kind: "season" as const, toDate: false },
        comparison: "season" as const,
      },
      "the wettest since records began in 1866",
    ],
    [
      {
        period: { kind: "year" as const, toDate: false },
        comparison: "all" as const,
      },
      "the wettest year since records began in 1866",
    ],
    [
      {
        period: { kind: "month" as const, toDate: true },
        measure: "maxTemp" as const,
      },
      "the hottest since records began in 1866",
    ],
    [
      {
        period: { kind: "season" as const, toDate: true },
        comparison: "season" as const,
      },
      "the wettest since records began in 1866",
    ],
    [
      {
        period: { kind: "year" as const, toDate: true },
        comparison: "all" as const,
        measure: "minTemp" as const,
      },
      "the warmest nights since records began in 1866",
    ],
    [
      {
        period: { kind: "year" as const, toDate: true },
        comparison: "all" as const,
        measure: "maxTemp" as const,
        rank: 3,
      },
      "so far the 3rd hottest year since records began in 1866",
    ],
    [
      {
        period: { kind: "rolling" as const, days: 3 },
        comparison: "all" as const,
      },
      "the wettest since records began in 1866",
    ],
    [
      {
        period: { kind: "rolling" as const, days: 7 },
        comparison: "season" as const,
      },
      "the wettest in spring since records began in 1866",
    ],
    [
      { period: { kind: "rolling" as const, days: 7 }, rank: 2 },
      "the 2nd wettest in October since records began in 1866",
    ],
  ])("words a period: %o", (fact, expected) => {
    expect(describeFact(periodFact(fact), "rank")).toBe(expected);
  });

  test.each([
    [{}, "2018-10-31", "the wettest since 2018"],
    [
      { comparison: "all" as const },
      "2026-03-31",
      "the wettest month since March",
    ],
    [
      { comparison: "all" as const },
      "2025-03-31",
      "the wettest month since March 2025",
    ],
    [
      { comparison: "all" as const },
      "2019-03-31",
      "the wettest month since 2019",
    ],
    [
      {
        period: { kind: "rolling" as const, days: 3 },
        comparison: "all" as const,
      },
      "2026-02-08",
      "the wettest since 8 February",
    ],
  ])("words a period's since: %o on %s", (fact, date, expected) => {
    expect(
      describeFact(
        periodFact({ ...fact, since: { date, value: 500 } }),
        "since",
      ),
    ).toBe(expected);
  });

  test("says how many earlier periods have gaps", () => {
    expect(describeFact(periodFact({ missingDays: 20 }), "rank")).toBe(
      "the wettest since records began in 1866 (not counting 20 years with gaps)",
    );
  });
});

describe("ordinal", () => {
  test.each([
    [1, "1st"],
    [2, "2nd"],
    [3, "3rd"],
    [4, "4th"],
    [11, "11th"],
    [12, "12th"],
    [13, "13th"],
    [21, "21st"],
    [102, "102nd"],
    [111, "111th"],
  ])("%i is %s", (n, expected) => {
    expect(ordinal(n)).toBe(expected);
  });
});
