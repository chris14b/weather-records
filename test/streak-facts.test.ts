import { describe, expect, test } from "vitest";
import type { CandidateFact } from "../src/pipeline/candidates.ts";
import { addDays, daysBetween } from "../src/pipeline/dates.ts";
import type { MultiDayValue, Series } from "../src/pipeline/series.ts";
import {
  comparableStreaks,
  generateStreakFacts,
} from "../src/pipeline/streak-facts.ts";
import type {
  Comparison,
  FactMeasure,
  StreakKind,
  ValueStatus,
} from "../src/shared/facts.ts";

const windowEnd = "2026-11-06";

/** Every day from `from` to `windowEnd` at `value`, leaving out the days it gives null for. */
function series(
  measure: FactMeasure,
  from: string,
  value: (date: string) => number | null,
  {
    multiDay = [],
    status = () => "confirmed",
  }: {
    multiDay?: readonly MultiDayValue[];
    status?: (date: string) => ValueStatus;
  } = {},
): Series {
  const days = Array.from(
    { length: daysBetween(from, windowEnd) + 1 },
    (_, index) => addDays(from, index),
  ).flatMap((date) => {
    const dayValue = value(date);
    return dayValue === null
      ? []
      : [{ date, value: dayValue, status: status(date) }];
  });
  return { measure, days, multiDay, fullRecord: true };
}

const within = (date: string, from: string, to: string) =>
  date >= from && date <= to;

/** 1 mm every day except in the dry spells given. */
function rainWithDrySpells(
  spells: readonly [string, string][],
  options?: Parameters<typeof series>[3],
): Series {
  return series(
    "rain",
    "2020-01-01",
    (date) => (spells.some(([from, to]) => within(date, from, to)) ? 0 : 1),
    options,
  );
}

function factsFor(input: Series): CandidateFact[] {
  return generateStreakFacts({
    locationId: "test",
    series: [input],
    windowEnd,
  });
}

function find(
  facts: readonly CandidateFact[],
  date: string,
  {
    streak = "dry",
    comparison = "all",
  }: { streak?: StreakKind; comparison?: Comparison } = {},
): CandidateFact | undefined {
  return facts.find(
    (fact) =>
      fact.date === date &&
      fact.comparison === comparison &&
      fact.period.kind === "streak" &&
      fact.period.streak === streak,
  );
}

describe("generateStreakFacts", () => {
  const rain = rainWithDrySpells([
    ["2021-03-01", "2021-03-10"],
    ["2023-05-01", "2023-05-07"],
    ["2024-06-01", "2024-06-07"],
    ["2026-10-30", windowEnd],
  ]);
  const facts = factsFor(rain);

  test("ranks a streak still running by its length so far against the earlier ones", () => {
    expect(find(facts, windowEnd)).toEqual({
      locationId: "test",
      date: windowEnd,
      from: "2026-10-30",
      period: { kind: "streak", streak: "dry", ended: false },
      measure: "rain",
      direction: "lowest",
      value: 8,
      status: "confirmed",
      comparison: "all",
      rank: 2,
      ties: 0,
      compared: daysBetween("2020-01-01", windowEnd) + 1,
      recordStart: "2020-01-01",
      fullRecord: true,
      missingDays: 0,
      gaps: [],
      since: { date: "2021-03-10", value: 10 },
      comparedSince: daysBetween("2021-03-10", windowEnd),
      beatenBy: null,
    });
  });

  test("gives streaks of equal length the same rank", () => {
    expect(find(facts, "2026-11-05")).toMatchObject({
      value: 7,
      rank: 2,
      ties: 2,
      since: { date: "2024-06-07", value: 7 },
    });
  });

  test("gives no facts to a streak shorter than its kind's minimum", () => {
    expect(find(facts, "2026-11-02")).toBeUndefined();
    expect(find(facts, "2026-11-03")).toMatchObject({ value: 5 });
  });

  test("compares a streak with those that ended in the same month or season", () => {
    expect(find(facts, windowEnd, { comparison: "month" })).toMatchObject({
      rank: 1,
      since: null,
      compared: 6 * 30 + 6,
      comparedSince: 6 * 30 + 6,
    });
    expect(find(facts, windowEnd, { comparison: "season" })).toMatchObject({
      rank: 1,
      since: null,
    });
    expect(
      facts.filter(({ comparison }) => comparison === "year"),
    ).toHaveLength(0);
  });

  test("ends a streak at a missing day, and gives none to the streak after it, which may have started earlier", () => {
    const gapped = factsFor(
      series("rain", "2020-01-01", (date) => {
        if (date === "2026-10-28") return null;
        return within(date, "2026-10-20", windowEnd) ? 0 : 1;
      }),
    );

    expect(find(gapped, "2026-10-27")).toMatchObject({
      from: "2026-10-20",
      value: 8,
      period: { ended: false },
    });
    expect(gapped.filter(({ date }) => date > "2026-10-28")).toHaveLength(0);
  });

  test("counts a missing day before it as missing", () => {
    const gapped = factsFor(
      series("rain", "2020-01-01", (date) => {
        if (date === "2026-10-20") return null;
        return within(date, "2026-10-25", windowEnd) ? 0 : 1;
      }),
    );

    expect(find(gapped, windowEnd)).toMatchObject({
      value: 13,
      missingDays: 1,
      gaps: [],
      compared: daysBetween("2020-01-01", windowEnd),
    });
  });

  test("names a week or more of missing days as a gap", () => {
    const gapped = factsFor(
      series("rain", "2020-01-01", (date) => {
        if (within(date, "2025-01-01", "2025-01-10")) return null;
        return within(date, "2026-10-25", windowEnd) ? 0 : 1;
      }),
    );

    expect(find(gapped, windowEnd)?.gaps).toEqual([
      { from: "2025-01-01", to: "2025-01-10" },
    ]);
  });

  test("counts the days of a 0 mm multi-day total as dry", () => {
    const withTotal = factsFor(
      series(
        "rain",
        "2020-01-01",
        (date) => {
          if (within(date, "2026-10-28", "2026-10-30")) return null;
          return within(date, "2026-10-25", windowEnd) ? 0 : 1;
        },
        {
          multiDay: [
            {
              from: "2026-10-28",
              date: "2026-10-30",
              value: 0,
              status: "confirmed",
            },
          ],
        },
      ),
    );

    expect(find(withTotal, windowEnd)).toMatchObject({
      from: "2026-10-25",
      value: 13,
      missingDays: 0,
    });
  });

  test("leaves the days of a multi-day total with rain missing", () => {
    const withTotal = factsFor(
      series(
        "rain",
        "2020-01-01",
        (date) => {
          if (within(date, "2026-10-28", "2026-10-30")) return null;
          return within(date, "2026-10-20", windowEnd) ? 0 : 1;
        },
        {
          multiDay: [
            {
              from: "2026-10-28",
              date: "2026-10-30",
              value: 2,
              status: "confirmed",
            },
          ],
        },
      ),
    );

    expect(find(withTotal, "2026-10-27")).toMatchObject({ value: 8 });
    expect(withTotal.filter(({ date }) => date > "2026-10-27")).toHaveLength(0);
  });

  test("says a streak has ended when the next day broke it, and which later streak beat it", () => {
    const maxTemp = factsFor(
      series("maxTemp", "2020-01-01", (date) =>
        within(date, "2026-10-10", "2026-10-12") ||
        within(date, "2026-10-20", "2026-10-23")
          ? 31
          : 25,
      ),
    );

    expect(find(maxTemp, "2026-10-11", { streak: "max30" })).toBeUndefined();
    expect(find(maxTemp, "2026-10-12", { streak: "max30" })).toMatchObject({
      from: "2026-10-10",
      period: { kind: "streak", streak: "max30", ended: true },
      measure: "maxTemp",
      direction: "highest",
      value: 3,
      rank: 1,
      beatenBy: { date: "2026-10-23", value: 4 },
    });
    expect(find(maxTemp, "2026-10-23", { streak: "max30" })).toMatchObject({
      period: { ended: true },
      value: 4,
      since: null,
      beatenBy: null,
    });
    expect(
      maxTemp.filter(
        ({ period }) => period.kind === "streak" && period.streak === "max35",
      ),
    ).toHaveLength(0);
  });

  test("is provisional if any of its days is", () => {
    const provisional = factsFor(
      rainWithDrySpells([["2026-10-30", windowEnd]], {
        status: (date) => (date === windowEnd ? "provisional" : "confirmed"),
      }),
    );

    expect(find(provisional, "2026-11-05")?.status).toBe("confirmed");
    expect(find(provisional, windowEnd)?.status).toBe("provisional");
  });

  test("lists the streaks a fact was compared with, and its own as it stood, for its why", () => {
    const fact = find(facts, "2026-11-05");
    if (fact === undefined) throw new Error("No fact for 2026-11-05");

    expect(
      comparableStreaks(rain, fact).filter(({ value }) => value >= 5),
    ).toEqual([
      { from: "2021-03-01", date: "2021-03-10", value: 10 },
      { from: "2023-05-01", date: "2023-05-07", value: 7 },
      { from: "2024-06-01", date: "2024-06-07", value: 7 },
      { from: "2026-10-30", date: "2026-11-05", value: 7 },
    ]);
  });
});
