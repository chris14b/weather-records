import { describe, expect, test } from "vitest";
import type {
  DaylightFact,
  PageFacts,
  RecordFact,
} from "../src/shared/facts.ts";
import {
  arrange,
  headlineSize,
  pageFor,
  standout,
} from "../src/site/arrange.ts";

const fact = (changes: Partial<RecordFact>): RecordFact => ({
  kind: "record",
  date: "2026-11-09",
  from: changes.date ?? "2026-11-09",
  period: { kind: "day" },
  measure: "minTemp",
  direction: "lowest",
  comparison: "all",
  status: "confirmed",
  lead: "since",
  score: 3,
  text: "the coldest night since 15 October",
  why: {
    value: 9,
    rank: 1,
    ties: 0,
    compared: 100,
    recordStart: "2009-01-01",
    fullRecord: false,
    missingDays: 0,
    gaps: [],
    record: null,
    since: null,
    leaders: [],
  },
  ...changes,
});

const longestDay: DaylightFact = {
  kind: "daylight",
  date: "2026-12-22",
  event: "longestDay",
  scope: "year",
  sunrise: "2026-12-21T18:41:00.000Z",
  sunset: "2026-12-22T09:06:00.000Z",
  score: 4.11,
  text: "the longest day of the year",
};

const pageFacts = (sections: Partial<PageFacts>): PageFacts => ({
  date: "2026-11-09",
  today: [],
  pastWeek: [],
  pastMonth: [],
  thisYear: [],
  comingWeek: [],
  ...sections,
});

describe("arrange", () => {
  test("leads with Today's strongest observed fact", () => {
    const weak = fact({ score: 2 });
    const strong = fact({ score: 4, measure: "rain" });
    const page = arrange(pageFacts({ today: [weak, strong] }));

    expect(page.headline).toBe(strong);
    expect(page.today).toEqual([weak]);
  });

  test("leads with an observed fact over a stronger forecast", () => {
    const observed = fact({});
    const forecast = fact({ status: "forecast", score: 5 });
    const page = arrange(pageFacts({ today: [observed, forecast] }));

    expect(page.headline).toBe(observed);
    expect(page.today).toEqual([forecast]);
  });

  test("leads with today's forecast when nothing was observed, but never a conditional fact", () => {
    const forecast = fact({ status: "forecast", score: 3 });
    const conditional = fact({ status: "conditional", score: 6 });
    const page = arrange(pageFacts({ today: [forecast, conditional] }));

    expect(page.headline).toBe(forecast);
    expect(page.today).toEqual([conditional]);
  });

  test("can lead with a turning point in the daylight", () => {
    const ordinary = fact({ date: "2026-12-22", score: 2 });
    const page = arrange(
      pageFacts({ today: [ordinary, longestDay], date: "2026-12-22" }),
    );

    expect(page.headline).toBe(longestDay);
    expect(page.today).toEqual([ordinary]);
  });

  test("never leads with a daylight fact from the coming week", () => {
    const page = arrange(
      pageFacts({ comingWeek: [longestDay], date: "2026-12-21" }),
    );

    expect(page.headline).toBeUndefined();
    expect(page.comingWeek).toEqual([longestDay]);
  });
});

describe("pageFor", () => {
  const pages = [pageFacts({}), pageFacts({ date: "2026-11-10" })];

  test.each([
    ["2026-11-09", "2026-11-09"],
    ["2026-11-10", "2026-11-10"],
    ["2026-11-12", "2026-11-10"],
    ["2026-11-08", "2026-11-09"],
  ])("shows a viewer on %s the page for %s", (viewerToday, date) => {
    expect(pageFor(pages, viewerToday)?.date).toBe(date);
  });

  test("has no page for a location without any", () => {
    expect(pageFor([], "2026-11-09")).toBeUndefined();
  });
});

describe("headlineSize", () => {
  test.each([
    [1, 1.75],
    [2, 1.75],
    [3.18, 2.64],
    [6, 4.75],
    [9, 5.5],
  ])("sizes a score of %d at %drem", (score, size) => {
    expect(headlineSize(score)).toBe(size);
  });
});

describe("standout", () => {
  test.each([
    ["today", 3.18],
    ["pastWeek", 3.43],
    ["pastMonth", 4.68],
    ["thisYear", 4.68],
    ["comingWeek", 3.43],
  ] as const)(
    "doesn't mark a fact in %s scoring %d, under twice as rare as it needs",
    (section, score) => {
      expect(standout(fact({ score }), section)).toBeUndefined();
    },
  );

  test.each([
    ["today", 3.2],
    ["pastWeek", 3.45],
    ["pastMonth", 4.7],
    ["thisYear", 4.7],
    ["comingWeek", 3.45],
  ] as const)("marks a fact in %s scoring %d faintly", (section, score) => {
    expect(standout(fact({ score }), section)).toBe(0);
  });

  test.each([
    "today",
    "pastWeek",
    "pastMonth",
    "thisYear",
    "comingWeek",
  ] as const)("gives an exceptional score in %s a strength of 1", (section) => {
    expect(standout(fact({ score: 6.5 }), section)).toBe(1);
  });

  test.each([
    [4.85, 0.5],
    [8.15, 1.5],
    [12, 1.5],
  ])("gives a fact in Today scoring %d a strength of %d", (score, strength) => {
    expect(standout(fact({ score }), "today")).toBe(strength);
  });

  test("judges a calendar period on the same scores as a day", () => {
    const year = fact({ score: 3.6, period: { kind: "year", toDate: true } });
    expect(standout(year, "thisYear")).toBeUndefined();
  });

  test("never marks daylight, which comes round every year", () => {
    expect(standout({ ...longestDay, score: 10 }, "today")).toBeUndefined();
  });

  test.each([
    [3.43, undefined],
    [3.45, 0],
  ])(
    "judges a conditional fact in Today scoring %d by the coming week's score",
    (score, strength) => {
      const conditional = fact({ status: "conditional", score });
      expect(standout(conditional, "today")).toBe(strength);
    },
  );
});

describe("arrange's standouts", () => {
  test.each([
    [3.43, undefined],
    [3.45, 0],
  ])(
    "judges a forecast in Today scoring %d by the coming week's score",
    (score, strength) => {
      const forecast = fact({ status: "forecast", score });
      const page = arrange(pageFacts({ today: [fact({}), forecast] }));

      expect(page.standouts.get(forecast)).toBe(strength);
    },
  );

  test("marks the headline", () => {
    const record = fact({ score: 6.5 });
    const page = arrange(pageFacts({ today: [record] }));

    expect(page.headline).toBe(record);
    expect(page.standouts.get(record)).toBe(1);
  });
});
