import { describe, expect, test } from "vitest";
import { previousOccurrence, scoreFact } from "../src/pipeline/scoring.ts";
import { dailyFact } from "./facts.ts";

const score = (...fact: Parameters<typeof dailyFact>) =>
  scoreFact(dailyFact(...fact)).score;

describe("scoreFact", () => {
  test("scores the 2nd hottest day on record above the 8th hottest day of the year", () => {
    const secondOnRecord = score({
      rank: 2,
      since: { date: "1939-01-14", value: 45.3 },
    });
    const eighthThisYear = score({
      comparison: "year",
      rank: 8,
      compared: 310,
      since: { date: "2026-10-12", value: 34.8 },
      comparedSince: 25,
    });

    expect(secondOnRecord).toBeGreaterThan(2 * eighthThisYear);
  });

  test("scores a record among every day at about the log of the days compared", () => {
    expect(score({ compared: 365 * 100 })).toBeCloseTo(Math.log(365 * 100));
  });

  test("leads with the since when it reaches further than the rank", () => {
    const smallestRangeSince = scoreFact(
      dailyFact({
        measure: "range",
        direction: "lowest",
        rank: 148,
        since: { date: "2026-02-08", value: 1.2 },
        comparedSince: 247,
      }),
    );

    expect(smallestRangeSince.lead).toBe("since");
    expect(smallestRangeSince.score).toBeCloseTo(Math.log(247) * 0.9);
  });

  test("prefers the wettest October day since 2018 to the 3rd wettest since 2011", () => {
    const fact = scoreFact(
      dailyFact({
        measure: "rain",
        comparison: "month",
        rank: 3,
        compared: 15 * 31,
        recordStart: "2011-08-01",
        since: { date: "2018-10-20", value: 60 },
        comparedSince: 8 * 31,
      }),
    );

    expect(fact.lead).toBe("since");
  });

  test("leads with the rank when it is more striking", () => {
    expect(
      scoreFact(
        dailyFact({
          rank: 2,
          since: { date: "2026-01-01", value: 41 },
          comparedSince: 300,
        }),
      ).lead,
    ).toBe("rank");
  });

  test.each([
    ["beyond 10th", { rank: 11 }],
    ["10th or better only by sharing it", { rank: 4, ties: 7 }],
    [
      "2nd for its calendar date",
      { comparison: "calendarDate" as const, rank: 2, compared: 120 },
    ],
  ])("gives no score to a rank %s that has no since", (_, fact) => {
    expect(score(fact)).toBe(0);
  });

  test("counts tied days against a rank", () => {
    expect(score({ ties: 4 })).toBeCloseTo(Math.log(10_000));
  });

  test("scores narrow comparisons lower", () => {
    const all = score({ compared: 5000 });
    const month = score({ comparison: "month", compared: 5000 });
    const calendarDate = score({ comparison: "calendarDate", compared: 5000 });

    expect(month).toBeLessThan(all);
    expect(calendarDate).toBeLessThan(month);
  });

  test("scores a rank lower in a short record, but not a since", () => {
    const long = dailyFact({ rank: 3, compared: 5000 });
    const short = { ...long, recordStart: "2016-01-01" };
    const since = {
      rank: 50,
      since: { date: "2020-01-01", value: 41 },
      comparedSince: 2000,
    };

    expect(scoreFact(short).score).toBeLessThan(scoreFact(long).score);
    expect(scoreFact({ ...short, ...since }).score).toBe(
      scoreFact({ ...long, ...since }).score,
    );
  });

  test("doesn't shorten a rank for the year so far by the record's length", () => {
    const year = { comparison: "year" as const, compared: 300 };

    expect(score({ ...year, recordStart: "2025-06-01" })).toBe(score(year));
  });

  test("scores a rank lower when comparable days are missing", () => {
    expect(score({ compared: 9000, missingDays: 1000 })).toBeCloseTo(
      Math.log(9000) * 0.9,
    );
  });

  test("ignores a since that a gap falls after", () => {
    const fact = dailyFact({
      rank: 40,
      since: { date: "2017-06-01", value: 41 },
      comparedSince: 2500,
      gaps: [{ from: "2018-03-25", to: "2020-07-31" }],
    });

    expect(scoreFact(fact).score).toBe(0);
    expect(
      scoreFact({ ...fact, since: { date: "2021-06-01", value: 41 } }).score,
    ).toBeGreaterThan(0);
  });

  test.each(["year", "calendarDate"] as const)(
    "ignores the since for the %s comparison",
    (comparison) => {
      expect(
        score({
          comparison,
          rank: 40,
          since: { date: "2020-01-01", value: 41 },
          comparedSince: 300,
        }),
      ).toBe(0);
    },
  );

  test.each([
    ["month", "2025-11-13", 0],
    ["month", "2025-10-31", 1],
    ["season", "2025-09-01", 0],
    ["season", "2025-08-31", 1],
  ] as const)(
    "ignores a %s since that only reaches back to last year's (%s)",
    (comparison, sinceDate, scores) => {
      const scored = score({
        comparison,
        rank: 40,
        since: { date: sinceDate, value: 41 },
        comparedSince: 30,
      });

      expect(scored > 0).toBe(scores === 1);
    },
  );

  test("scores humidity lower than temperature", () => {
    expect(score({ measure: "maxRelHum" })).toBeLessThan(score());
  });
});

describe("previousOccurrence", () => {
  test.each([
    ["2026-11-09", "month", "2025-11-01"],
    ["2026-11-09", "season", "2025-09-01"],
    ["2026-12-05", "season", "2025-12-01"],
    ["2027-02-10", "season", "2025-12-01"],
    ["2026-03-01", "season", "2025-03-01"],
  ] as const)(
    "on %s, last year's %s began on %s",
    (date, comparison, expected) => {
      expect(previousOccurrence(date, comparison)).toBe(expected);
    },
  );
});
