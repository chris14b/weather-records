import { describe, expect, test } from "vitest";
import type { Fact, LocationFacts } from "../src/shared/facts.ts";
import { arrange, headlineSize } from "../src/site/arrange.ts";

const fact = (changes: Partial<Fact>): Fact => ({
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

const location = (sections: Partial<LocationFacts>): LocationFacts => ({
  locationId: "sydney-airport",
  today: [],
  thisWeek: [],
  thisMonth: [],
  comingWeek: [],
  forecast: [],
  ...sections,
});

describe("arrange", () => {
  test("leads with Today's strongest observed fact", () => {
    const weak = fact({ score: 2 });
    const strong = fact({ score: 4, measure: "rain" });
    const page = arrange(location({ today: [weak, strong] }), "2026-11-09");

    expect(page.headline).toBe(strong);
    expect(page.today).toEqual([weak]);
  });

  test("moves the coming week's facts about the latest day into Today", () => {
    const observed = fact({});
    const forecast = fact({ status: "forecast", score: 5 });
    const tomorrow = fact({ date: "2026-11-10", status: "conditional" });
    const page = arrange(
      location({ today: [observed], comingWeek: [forecast, tomorrow] }),
      "2026-11-09",
    );

    expect(page.headline).toBe(observed);
    expect(page.today).toEqual([forecast]);
    expect(page.comingWeek).toEqual([tomorrow]);
  });

  test("keeps a 7-day forecast that ends later in the coming week", () => {
    const week = fact({
      from: "2026-11-09",
      date: "2026-11-15",
      period: { kind: "rolling", days: 7 },
      status: "forecast",
    });
    const page = arrange(location({ comingWeek: [week] }), "2026-11-09");

    expect(page.comingWeek).toEqual([week]);
    expect(page.headline).toBeUndefined();
  });

  test("leads with today's forecast when nothing was observed, but never a conditional fact", () => {
    const forecast = fact({ status: "forecast", score: 3 });
    const conditional = fact({ status: "conditional", score: 6 });
    const page = arrange(
      location({ comingWeek: [forecast, conditional] }),
      "2026-11-09",
    );

    expect(page.headline).toBe(forecast);
    expect(page.today).toEqual([conditional]);
  });

  test("names the viewer's today when Today is empty", () => {
    expect(arrange(location({}), "2026-11-10")).toMatchObject({
      date: "2026-11-10",
      headline: undefined,
      today: [],
    });
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
