import { describe, expect, test } from "vitest";
import type { DailyFact } from "../src/pipeline/daily-facts.ts";
import { describeFact, ordinal } from "../src/pipeline/wording.ts";
import type { Lead } from "../src/shared/facts.ts";
import { dailyFact } from "./facts.ts";

const words = (fact: Partial<DailyFact>, lead: Lead = "rank") =>
  describeFact(dailyFact(fact), lead);

describe("describeFact", () => {
  test.each([
    [{}, "the hottest day on record"],
    [{ rank: 2 }, "the 2nd hottest day on record"],
    [{ rank: 3, ties: 1 }, "the equal 3rd hottest day on record"],
    [{ ties: 2 }, "the equal hottest day on record"],
    [{ comparison: "year" as const }, "the hottest day of the year so far"],
    [{ comparison: "season" as const }, "the hottest spring day on record"],
    [{ comparison: "month" as const }, "the hottest November day on record"],
    [
      { comparison: "calendarDate" as const },
      "the hottest 6 November on record",
    ],
    [
      { comparison: "calendarDate" as const, measure: "minTemp" as const },
      "the warmest 6 November night on record",
    ],
  ])("words a rank: %o", (fact, expected) => {
    expect(words(fact)).toBe(expected);
  });

  test.each([
    ["maxTemp", "lowest", "the coldest day"],
    ["minTemp", "highest", "the warmest night"],
    ["minTemp", "lowest", "the coldest night"],
    ["rain", "highest", "the wettest day"],
    ["range", "lowest", "the smallest temperature range"],
    ["maxRelHum", "highest", "the highest peak humidity"],
    ["minRelHum", "highest", "the most humid day"],
    ["minRelHum", "lowest", "the lowest humidity"],
    ["solar", "highest", "the sunniest day"],
    ["solar", "lowest", "the gloomiest day"],
    ["temp9am", "lowest", "the coldest 9am"],
    ["relHum3pm", "lowest", "the driest 3pm"],
  ] as const)("words %s %s as %s", (measure, direction, expected) => {
    expect(words({ measure, direction })).toBe(`${expected} on record`);
  });

  test.each([
    ["1900-01-01", "since 1900"],
    ["2011-09-01", "since 2011"],
    ["2026-03-14", "since March 2026"],
  ])(
    "says since when a record started on %s, not on record",
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
    ).toBe("the wettest November day since 2018");
  });

  test.each([
    ["2026-11-08", "until Sunday"],
    ["2026-11-12", "until Thursday"],
    ["2026-11-13", "until 13 November"],
  ])("says a later day on %s beat it", (date, expected) => {
    expect(words({ comparison: "year", beatenBy: { date, value: 41 } })).toBe(
      `the hottest day of the year so far, ${expected}`,
    );
  });

  test("says a fact is provisional", () => {
    expect(
      words({
        status: "provisional",
        comparison: "year",
        beatenBy: { date: "2026-11-08", value: 41 },
      }),
    ).toBe("provisionally the hottest day of the year so far, until Sunday");
  });

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
      "the hottest day on record (with 100 days missing)",
    );
  });

  test("says nothing of a few missing days", () => {
    expect(
      words({
        missingDays: 300,
        gaps: [{ from: "1865-03-01", to: "1865-03-31" }],
      }),
    ).toBe("the hottest day on record");
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
