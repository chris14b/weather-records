import { describe, expect, test } from "vitest";
import type { CandidateFact } from "../src/pipeline/candidates.ts";
import { addDays, daysBetween } from "../src/pipeline/dates.ts";
import {
  comparablePeriods,
  generatePeriodFacts,
} from "../src/pipeline/period-facts.ts";
import type { MultiDayValue, Series } from "../src/pipeline/series.ts";
import type {
  Comparison,
  Direction,
  FactMeasure,
  Period,
} from "../src/shared/facts.ts";
import type { StationOffset } from "../src/shared/locations.ts";

/** Every day from `from` to `to` at `value`, leaving out the days it gives null for. */
function series(
  measure: FactMeasure,
  from: string,
  to: string,
  value: (date: string) => number | null,
  multiDay: readonly MultiDayValue[] = [],
): Series {
  const days = Array.from({ length: daysBetween(from, to) + 1 }, (_, index) =>
    addDays(from, index),
  ).flatMap((date) => {
    const dayValue = value(date);
    return dayValue === null
      ? []
      : [{ date, value: dayValue, status: "confirmed" as const }];
  });
  return { measure, days, multiDay, fullRecord: true };
}

function factsFor(
  input: Series,
  windowEnd: string,
  offsets: readonly StationOffset[] = [],
): CandidateFact[] {
  return generatePeriodFacts({
    locationId: "test",
    series: [input],
    windowEnd,
    offsets,
  });
}

interface Wanted {
  period: Period;
  comparison?: Comparison;
  direction?: Direction;
  from?: string;
}

function matching(
  facts: readonly CandidateFact[],
  { period, comparison = "all", direction = "highest", from }: Wanted,
): CandidateFact[] {
  return facts.filter(
    (fact) =>
      JSON.stringify(fact.period) === JSON.stringify(period) &&
      fact.comparison === comparison &&
      fact.direction === direction &&
      (from === undefined || fact.from === from),
  );
}

function find(facts: readonly CandidateFact[], wanted: Wanted): CandidateFact {
  const [fact, ...others] = matching(facts, wanted);
  if (fact === undefined || others.length > 0) {
    throw new Error(`Not exactly one fact for ${JSON.stringify(wanted)}`);
  }
  return fact;
}

const month = { kind: "month", toDate: false } as const;
const season = { kind: "season", toDate: false } as const;
const year = { kind: "year", toDate: false } as const;
const monthSoFar = { kind: "month", toDate: true } as const;
const seasonSoFar = { kind: "season", toDate: true } as const;
const yearSoFar = { kind: "year", toDate: true } as const;
const threeDays = { kind: "rolling", days: 3 } as const;
const sevenDays = { kind: "rolling", days: 7 } as const;

const inMonth = (date: string, months: readonly string[]) =>
  months.includes(date.slice(0, 7));

describe("generatePeriodFacts for complete periods", () => {
  // 1 mm a day, with a wetter October in 2020 and 2026.
  const rain = series("rain", "2016-01-01", "2027-01-10", (date) => {
    if (inMonth(date, ["2020-10"])) return 6;
    return inMonth(date, ["2026-10"]) ? 5 : 1;
  });
  const facts = factsFor(rain, "2026-11-06");

  test("ranks the latest complete month's rain among every month", () => {
    expect(find(facts, { period: month })).toMatchObject({
      locationId: "test",
      measure: "rain",
      from: "2026-10-01",
      date: "2026-10-31",
      value: 155,
      status: "confirmed",
      rank: 2,
      ties: 0,
      compared: 130,
      recordStart: "2016-01-01",
      fullRecord: true,
      since: { date: "2020-10-31", value: 186 },
      comparedSince: 72,
      beatenBy: null,
      missingDays: 0,
      gaps: [],
    });
  });

  test("ranks it among the same month of every year", () => {
    expect(find(facts, { period: month, comparison: "month" })).toMatchObject({
      rank: 2,
      compared: 11,
      since: { date: "2020-10-31", value: 186 },
      comparedSince: 6,
    });
  });

  test("gives the driest as well as the wettest", () => {
    expect(find(facts, { period: month, direction: "lowest" })).toMatchObject({
      rank: 129,
      since: { date: "2026-09-30", value: 30 },
    });
  });

  test("ranks the latest complete season among the same season of every year", () => {
    const spring = find(factsFor(rain, "2026-12-05"), {
      period: season,
      comparison: "season",
    });

    expect(spring).toMatchObject({
      from: "2026-09-01",
      date: "2026-11-30",
      value: 30 + 155 + 30,
      rank: 2,
      compared: 11,
      since: { date: "2020-11-30", value: 30 + 186 + 30 },
    });
  });

  test("ranks the latest complete year among every year", () => {
    expect(find(factsFor(rain, "2027-01-10"), { period: year })).toMatchObject({
      from: "2026-01-01",
      date: "2026-12-31",
      value: 365 - 31 + 155,
      rank: 2,
      compared: 11,
      since: { date: "2020-12-31", value: 366 - 31 + 186 },
    });
  });

  test("leaves out the latest complete period once it ended before the window", () => {
    expect(
      matching(factsFor(rain, "2027-01-10"), {
        period: season,
        comparison: "season",
      }),
    ).toEqual([]);
  });
});

describe("generatePeriodFacts for periods so far", () => {
  // 20°C a day, with a hot November in 2026.
  const max = series("maxTemp", "2016-01-01", "2026-11-30", (date) =>
    inMonth(date, ["2026-11"]) ? 25 : 20,
  );

  test.each([
    [monthSoFar, "month", "2026-11-01"],
    [seasonSoFar, "season", "2026-09-01"],
    [yearSoFar, "all", "2026-01-01"],
  ] as const)(
    "compares %o with the same days of every earlier year",
    (period, comparison, from) => {
      expect(
        find(factsFor(max, "2026-11-10"), { period, comparison }),
      ).toMatchObject({
        from,
        date: "2026-11-10",
        rank: 1,
        ties: 0,
        compared: 11,
        since: null,
      });
    },
  );

  test("needs a week of the month first", () => {
    expect(
      matching(factsFor(max, "2026-11-06"), {
        period: monthSoFar,
        comparison: "month",
      }),
    ).toEqual([]);
  });

  test("leaves the last day of a period to the complete period", () => {
    const facts = factsFor(max, "2026-11-30");

    expect(
      matching(facts, { period: monthSoFar, comparison: "month" }),
    ).toEqual([]);
    expect(find(facts, { period: month, comparison: "month" })).toMatchObject({
      value: 25,
      rank: 1,
    });
  });

  test("starts a season and a year so far only after their first month", () => {
    const facts = factsFor(max, "2026-09-20");

    expect(
      matching(facts, { period: seasonSoFar, comparison: "season" }),
    ).toEqual([]);
    expect(
      matching(factsFor(max, "2026-01-20"), { period: yearSoFar }),
    ).toEqual([]);
    expect(
      matching(facts, { period: monthSoFar, comparison: "month" }),
    ).toHaveLength(1);
  });

  test("compares 29 February with the 28th in other years", () => {
    const leap = series("maxTemp", "2016-01-01", "2024-02-29", () => 20);
    const fact = find(factsFor(leap, "2024-02-29"), { period: yearSoFar });

    expect(
      comparablePeriods(leap, fact).map(({ from, date }) => `${from}..${date}`),
    ).toEqual(
      [
        "2016",
        "2017",
        "2018",
        "2019",
        "2020",
        "2021",
        "2022",
        "2023",
        "2024",
      ].map(
        (y) =>
          `${y}-01-01..${y}-02-${["2016", "2020", "2024"].includes(y) ? "29" : "28"}`,
      ),
    );
  });
});

describe("generatePeriodFacts with missing days", () => {
  const missingIn = (dates: readonly string[]) =>
    series("maxTemp", "2016-01-01", "2026-11-06", (date) =>
      dates.includes(date) ? null : inMonth(date, ["2026-10"]) ? 25 : 20,
    );
  const octoberDays = (...days: number[]) =>
    days.map((day) => `2026-10-${String(day).padStart(2, "0")}`);
  const october2019 = ["01", "02", "03", "04"].map((day) => `2019-10-${day}`);

  test.each([
    ["5 scattered days", octoberDays(1, 7, 13, 19, 25), true],
    ["6 scattered days", octoberDays(1, 7, 13, 19, 25, 31), false],
    ["3 days in a row", octoberDays(10, 11, 12), true],
    ["4 days in a row", octoberDays(10, 11, 12, 13), false],
  ])(
    "averages a month missing %s only if that is few enough",
    (_, missing, compared) => {
      expect(
        matching(factsFor(missingIn(missing), "2026-11-06"), {
          period: month,
        }),
      ).toHaveLength(compared ? 1 : 0);
    },
  );

  test("counts earlier periods with too many missing days as missing, not as values", () => {
    const fact = find(factsFor(missingIn(october2019), "2026-11-06"), {
      period: month,
      comparison: "month",
    });

    expect(fact).toMatchObject({
      compared: 10,
      missingDays: 1,
      gaps: [{ from: "2019-10-01", to: "2019-10-31" }],
    });
  });

  test("needs every day's rain for a total", () => {
    const rain = series("rain", "2016-01-01", "2026-11-06", (date) =>
      date === "2026-10-15" ? null : 1,
    );

    expect(matching(factsFor(rain, "2026-11-06"), { period: month })).toEqual(
      [],
    );
  });

  test("counts a multi-day rain total that falls wholly inside a period", () => {
    const rain = series(
      "rain",
      "2016-01-01",
      "2026-11-06",
      (date) => (date >= "2026-10-10" && date <= "2026-10-12" ? null : 1),
      [
        {
          from: "2026-10-10",
          date: "2026-10-12",
          value: 30,
          status: "confirmed",
        },
      ],
    );

    expect(find(factsFor(rain, "2026-11-06"), { period: month })).toMatchObject(
      { value: 28 + 30 },
    );
  });

  test("leaves a period incomplete when a multi-day total crosses its start", () => {
    const rain = series(
      "rain",
      "2016-01-01",
      "2026-11-06",
      (date) => (date >= "2026-09-29" && date <= "2026-10-01" ? null : 1),
      [
        {
          from: "2026-09-29",
          date: "2026-10-01",
          value: 30,
          status: "confirmed",
        },
      ],
    );

    expect(matching(factsFor(rain, "2026-11-06"), { period: month })).toEqual(
      [],
    );
  });

  test("marks a period provisional if any of its days is", () => {
    const rain = series("rain", "2016-01-01", "2026-11-06", () => 1);
    const provisional: Series = {
      ...rain,
      days: rain.days.map((day) =>
        day.date === "2026-10-31" ? { ...day, status: "provisional" } : day,
      ),
    };

    expect(
      find(factsFor(provisional, "2026-11-06"), { period: month }).status,
    ).toBe("provisional");
  });
});

describe("generatePeriodFacts for runs of days", () => {
  const storms: Record<string, number> = {
    // Earlier spells that beat 60 mm over 3 days: one lasting several days, and one short.
    "2018-06-01": 25,
    "2018-06-02": 25,
    "2018-06-03": 25,
    "2018-06-04": 25,
    "2018-06-05": 25,
    "2020-03-01": 20,
    "2020-03-02": 30,
    "2020-03-03": 25,
    "2026-10-20": 10,
    "2026-10-21": 30,
    "2026-10-22": 20,
    // A spell with less rain than the one before it overlaps.
    "2026-10-25": 30,
    "2026-10-26": 30,
    "2026-10-27": 5,
    "2026-10-28": 25,
    // Mostly one day's rain.
    "2026-11-02": 1,
    "2026-11-03": 80,
    "2026-11-04": 1,
  };
  const rain = series(
    "rain",
    "2016-01-01",
    "2026-11-06",
    (date) => storms[date] ?? 0,
  );
  const facts = factsFor(rain, "2026-11-06");

  test("ranks the 3 days to a day, counting each earlier spell once", () => {
    expect(
      find(facts, { period: threeDays, from: "2026-10-20" }),
    ).toMatchObject({
      date: "2026-10-22",
      value: 60,
      rank: 3,
      ties: 0,
      since: { date: "2020-03-03", value: 75 },
      beatenBy: { date: "2026-10-27", value: 65 },
    });
  });

  test("compares it with the same season and month too", () => {
    expect(
      find(facts, {
        period: threeDays,
        comparison: "season",
        from: "2026-10-20",
      }),
    ).toMatchObject({ rank: 1, since: null });
    expect(
      find(facts, {
        period: threeDays,
        comparison: "month",
        from: "2026-10-20",
      }),
    ).toMatchObject({ rank: 1, since: null });
  });

  test("leaves out a run that an overlapping earlier one matched or beat", () => {
    expect(matching(facts, { period: threeDays, from: "2026-10-26" })).toEqual(
      [],
    );
    expect(
      find(facts, { period: threeDays, from: "2026-10-25" }),
    ).toMatchObject({
      value: 65,
      rank: 3,
      beatenBy: { date: "2026-11-03", value: 81 },
    });
  });

  test("ranks the 7 days to a day as well", () => {
    expect(
      find(facts, { period: sevenDays, from: "2026-10-20" }),
    ).toMatchObject({
      date: "2026-10-26",
      value: 120,
      rank: 2,
      since: { date: "2018-06-07", value: 125 },
    });
  });

  test("leaves out runs that start or end dry, or whose rain mostly fell on one day", () => {
    const froms = matching(facts, { period: threeDays }).map(
      ({ from }) => from,
    );

    expect(froms).toEqual(["2026-10-20", "2026-10-25"]);
  });

  test("gives no lowest facts", () => {
    expect(matching(facts, { period: threeDays, direction: "lowest" })).toEqual(
      [],
    );
  });
});

describe("generatePeriodFacts across a station change", () => {
  const offsets = [{ from: "2020-09-01", maxTemp: 0.3, minTemp: -0.3 }];
  const max = series("maxTemp", "2016-01-01", "2026-02-10", (date) => {
    if (inMonth(date, ["2019-01"])) return 25;
    return inMonth(date, ["2026-01"]) ? 25.2 : 20;
  });

  test("only beats an earlier station's period if it does so after taking out the difference", () => {
    const january = { period: month, comparison: "month" } as const;

    expect(find(factsFor(max, "2026-02-10"), january)).toMatchObject({
      rank: 1,
      since: null,
    });
    expect(find(factsFor(max, "2026-02-10", offsets), january)).toMatchObject({
      rank: 2,
      since: { date: "2019-01-31", value: 25 },
    });
  });

  test("keeps a record that holds both as measured and after taking out the difference", () => {
    const july = series("maxTemp", "2016-01-01", "2026-08-10", (date) => {
      if (inMonth(date, ["2018-07"])) return 15;
      return inMonth(date, ["2026-07"]) ? 14.9 : 20;
    });

    expect(
      find(factsFor(july, "2026-08-10", offsets), {
        period: month,
        comparison: "month",
        direction: "lowest",
      }),
    ).toMatchObject({ rank: 1, since: null });
  });
});
