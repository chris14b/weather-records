import { describe, expect, test } from "vitest";
import {
  dayName,
  longDate,
  periodName,
  sentence,
  sydneyDate,
  type Phrased,
} from "../src/site/naming.ts";

const today = "2026-11-09";

const fact = (changes: Partial<Phrased> = {}): Phrased => ({
  date: today,
  from: changes.date ?? today,
  period: { kind: "day" },
  status: "confirmed",
  text: "the hottest day on record",
  ...changes,
});

describe("sydneyDate", () => {
  test.each([
    ["2026-11-08T12:59:00Z", "2026-11-08"],
    ["2026-11-08T13:00:00Z", "2026-11-09"],
    ["2026-06-30T13:59:00Z", "2026-06-30"],
    ["2026-06-30T14:00:00Z", "2026-07-01"],
  ])("gives Sydney's date at %s", (instant, expected) => {
    expect(sydneyDate(new Date(instant))).toBe(expected);
  });
});

describe("dayName", () => {
  test.each([
    ["2026-11-09", "today"],
    ["2026-11-08", "yesterday"],
    ["2026-11-10", "tomorrow"],
    ["2026-11-07", "Saturday"],
    ["2026-11-03", "Tuesday"],
    ["2026-11-02", "2 November"],
    ["2026-11-15", "Sunday"],
    ["2026-11-16", "16 November"],
    ["2025-12-31", "31 December 2025"],
  ])("names %s", (date, expected) => {
    expect(dayName(date, today)).toBe(expected);
  });
});

describe("longDate", () => {
  test.each([
    ["2026-11-09", "Monday 9 November 2026"],
    ["2026-11-15", "Sunday 15 November 2026"],
    ["1970-01-01", "Thursday 1 January 1970"],
    ["1939-01-14", "Saturday 14 January 1939"],
  ])("writes %s", (date, expected) => {
    expect(longDate(date)).toBe(expected);
  });
});

describe("periodName", () => {
  test.each([
    [
      {
        period: { kind: "rolling", days: 3 },
        from: "2026-11-05",
        date: "2026-11-07",
      },
      "the 3 days to Saturday",
    ],
    [
      {
        period: { kind: "rolling", days: 7 },
        from: "2026-11-09",
        date: "2026-11-15",
      },
      "the 7 days to Sunday",
    ],
    [
      {
        period: { kind: "month", toDate: false },
        from: "2026-10-01",
        date: "2026-10-31",
      },
      "October",
    ],
    [
      {
        period: { kind: "month", toDate: false },
        from: "2025-12-01",
        date: "2025-12-31",
      },
      "December 2025",
    ],
    [
      {
        period: { kind: "month", toDate: true },
        from: "2026-11-01",
        date: "2026-11-09",
      },
      "November so far",
    ],
    [
      {
        period: { kind: "season", toDate: false },
        from: "2026-06-01",
        date: "2026-08-31",
      },
      "winter",
    ],
    [
      {
        period: { kind: "season", toDate: true },
        from: "2026-09-01",
        date: "2026-11-09",
      },
      "spring so far",
    ],
    [
      {
        period: { kind: "season", toDate: false },
        from: "2025-12-01",
        date: "2026-02-28",
      },
      "summer",
    ],
    [
      {
        period: { kind: "year", toDate: false },
        from: "2025-01-01",
        date: "2025-12-31",
      },
      "2025",
    ],
    [
      {
        period: { kind: "year", toDate: true },
        from: "2026-01-01",
        date: "2026-11-09",
      },
      "the year so far",
    ],
  ] as const)("names %o", (named, expected) => {
    expect(periodName(named, today)).toBe(expected);
  });
});

describe("sentence", () => {
  test.each([
    [fact(), "Today", "is the hottest day on record"],
    [fact({ date: "2026-11-07" }), "Saturday", "was the hottest day on record"],
    [
      fact({
        status: "provisional",
        text: "provisionally the coldest night since 15 October",
      }),
      "Today",
      "is provisionally the coldest night since 15 October",
    ],
    [
      fact({
        date: "2026-11-10",
        status: "forecast",
        text: "forecast to be the coldest November day since 2022",
      }),
      "Tomorrow",
      "is forecast to be the coldest November day since 2022",
    ],
    [
      fact({
        date: "2026-11-10",
        status: "conditional",
        text: "would be the coldest November night since 2006 if it drops to 10°C (forecast 12°C)",
      }),
      "Tomorrow",
      "would be the coldest November night since 2006 if it drops to 10°C (forecast 12°C)",
    ],
    [
      fact({
        period: { kind: "rolling", days: 3 },
        from: "2026-11-05",
        date: "2026-11-07",
        text: "the wettest 3 days on record",
      }),
      "The 3 days to Saturday",
      "were the wettest 3 days on record",
    ],
    [
      fact({
        period: { kind: "rolling", days: 7 },
        from: "2026-11-09",
        date: "2026-11-15",
        status: "forecast",
        text: "forecast to be the wettest 7 days since 2022",
      }),
      "The 7 days to Sunday",
      "are forecast to be the wettest 7 days since 2022",
    ],
    [
      fact({
        period: { kind: "month", toDate: false },
        from: "2026-10-01",
        date: "2026-10-31",
        text: "the wettest October on record",
      }),
      "October",
      "was the wettest October on record",
    ],
    [
      fact({
        period: { kind: "year", toDate: true },
        from: "2026-01-01",
        date: "2026-11-07",
        text: "the 3rd hottest start to the year on record",
      }),
      "The year so far",
      "is the 3rd hottest start to the year on record",
    ],
  ])("phrases %#: %s %s", (phrased, subject, predicate) => {
    expect(sentence(phrased, today)).toEqual({ subject, predicate });
  });
});
