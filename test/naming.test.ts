import { describe, expect, test } from "vitest";
import {
  amount,
  dayName,
  longDate,
  nightName,
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
  measure: "maxTemp",
  direction: "highest",
  comparison: "all",
  status: "confirmed",
  text: "the hottest day since records began in 1859",
  why: { value: 45.8 },
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

describe("nightName", () => {
  test.each([
    ["2026-11-09", "last night"],
    ["2026-11-10", "tonight"],
    ["2026-11-11", "tomorrow night"],
    ["2026-11-08", "Saturday night"],
    ["2026-11-06", "Thursday night"],
    ["2026-11-14", "Friday night"],
    ["2026-11-03", "the night of 2 November"],
    ["2026-01-01", "the night of 31 December 2025"],
  ])("names the night that ends on %s", (date, expected) => {
    expect(nightName(date, today)).toBe(expected);
  });
});

describe("amount", () => {
  test.each([
    ["maxTemp", 23, false, "23.0°C"],
    ["minTemp", 11.6, false, "11.6°C"],
    ["minTemp", 12, true, "12°C"],
    ["rain", 1234.5, false, "1,234.5 mm"],
    ["relHum3pm", 31, false, "31%"],
    ["solar", 27.54, false, "27.5 MJ/m²"],
    ["maxTempChange", -14.9, false, "14.9°C"],
  ] as const)("writes %s %d", (measure, value, forecast, expected) => {
    expect(amount(measure, value, forecast)).toBe(expected);
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
      "2026",
    ],
    [
      { period: { kind: "day" }, measure: "minTemp", from: today, date: today },
      "last night",
    ],
    [
      {
        period: { kind: "day" },
        measure: "rain",
        from: "2026-11-04",
        date: "2026-11-04",
      },
      "the 24 hours to 9am Wednesday",
    ],
  ] as const)("names %o", (named, expected) => {
    expect(periodName(named, today)).toBe(expected);
  });
});

describe("sentence", () => {
  const says = (phrased: Phrased) => {
    const { before, subject, after } = sentence(phrased, today);
    return `${before}[${subject}]${after}`;
  };

  test.each([
    [
      fact(),
      "[Today] is the hottest day since records began in 1859, with a top of 45.8°C",
    ],
    [
      fact({ date: "2026-11-05", text: "the coldest day since 27 October" }),
      "[Thursday] was the coldest day since 27 October, with a top of 45.8°C",
    ],
    [
      fact({
        measure: "minTemp",
        direction: "lowest",
        status: "provisional",
        text: "the coldest since 15 October",
        why: { value: 11.6 },
      }),
      "[Last night] was the coldest since 15 October, with a low of 11.6°C",
    ],
    [
      fact({
        date: "2026-11-06",
        measure: "minTemp",
        direction: "lowest",
        text: "the coldest in November since 2024",
        why: { value: 14.3 },
      }),
      "[Thursday night] was the coldest in November since 2024, with a low of 14.3°C",
    ],
    [
      fact({
        measure: "rain",
        text: "the wettest since 16 October",
        why: { value: 22.4 },
      }),
      "[The 24 hours to 9am today] were the wettest since 16 October, with 22.4 mm",
    ],
    [
      fact({
        date: "2026-11-07",
        measure: "maxTempChange",
        text: "the biggest day-to-day rise in maximum temperature in November since 2024",
        why: { value: 6.7 },
      }),
      "[Saturday] had the biggest day-to-day rise in maximum temperature in November since 2024, up 6.7°C",
    ],
    [
      fact({
        measure: "minRelHum",
        text: "the most humid day since 3 March",
        why: { value: 82 },
      }),
      "[Today] is the most humid day since 3 March, never below 82%",
    ],
    [
      fact({
        date: "2026-11-10",
        status: "forecast",
        direction: "lowest",
        text: "the coldest November day since 2022",
        why: { value: 20 },
      }),
      "[Tomorrow] is forecast to be the coldest November day since 2022, with a top of 20°C",
    ],
    [
      fact({
        date: "2026-11-10",
        measure: "minTemp",
        direction: "lowest",
        status: "conditional",
        text: "the coldest in November since 2006",
        why: { value: 10, forecast: 12 },
      }),
      "A low of 10°C [tonight] (forecast 12°C) would make it the coldest in November since 2006",
    ],
    [
      fact({
        date: "2026-11-12",
        status: "conditional",
        text: "the hottest November day since records began in 1859",
        why: { value: 36.6, forecast: 35 },
      }),
      "A top of 36.6°C on [Thursday] (forecast 35°C) would make it the hottest November day since records began in 1859",
    ],
    [
      fact({
        period: { kind: "rolling", days: 7 },
        from: "2026-11-10",
        date: "2026-11-16",
        measure: "rain",
        status: "conditional",
        text: "the wettest since 2022",
        why: { value: 90.1, forecast: 70 },
      }),
      "90.1 mm in [the 7 days to 16 November] (forecast 70 mm) would make them the wettest since 2022",
    ],
    [
      fact({
        period: { kind: "rolling", days: 3 },
        from: "2026-11-05",
        date: "2026-11-07",
        measure: "rain",
        text: "the wettest since records began in 1859",
        why: { value: 120.4 },
      }),
      "[The 3 days to Saturday] were the wettest since records began in 1859, with 120.4 mm",
    ],
    [
      fact({
        period: { kind: "month", toDate: false },
        from: "2026-10-01",
        date: "2026-10-31",
        measure: "rain",
        text: "the wettest since records began in 1859",
        why: { value: 300 },
      }),
      "[October] was the wettest since records began in 1859, with 300.0 mm",
    ],
    [
      fact({
        period: { kind: "year", toDate: true },
        from: "2026-01-01",
        date: "2026-11-07",
        text: "so far the 3rd hottest year since records began in 1859",
        why: { value: 23.6 },
      }),
      "[2026] is so far the 3rd hottest year since records began in 1859, with an average top of 23.6°C",
    ],
    [
      fact({
        period: { kind: "month", toDate: true },
        from: "2026-11-01",
        date: "2026-11-09",
        measure: "minTemp",
        comparison: "month",
        text: "the warmest nights since 2009",
        why: { value: 17.2 },
      }),
      "[November so far] has had the warmest nights since 2009, with an average low of 17.2°C",
    ],
    [
      fact({
        period: { kind: "year", toDate: true },
        from: "2026-01-01",
        date: "2026-11-09",
        measure: "minTemp",
        text: "the warmest nights since records began in 1859",
        why: { value: 15 },
      }),
      "[2026] has so far had the warmest nights since records began in 1859, with an average low of 15.0°C",
    ],
    [
      fact({
        period: { kind: "month", toDate: false },
        from: "2026-07-01",
        date: "2026-07-31",
        measure: "minTemp",
        direction: "lowest",
        comparison: "all",
        text: "the month with the coldest nights since July 2024",
        why: { value: 6.1 },
      }),
      "[July] was the month with the coldest nights since July 2024, with an average low of 6.1°C",
    ],
    [
      fact({
        date: "2026-11-05",
        measure: "maxRelHum",
        direction: "lowest",
        text: "the lowest peak humidity since 27 October",
        why: { value: 78 },
      }),
      "[Thursday] had the lowest peak humidity since 27 October, at 78%",
    ],
    [
      fact({
        measure: "range",
        direction: "lowest",
        text: "the smallest temperature range since 8 February",
        why: { value: 1.3 },
      }),
      "[Today] has the smallest temperature range since 8 February, at 1.3°C",
    ],
  ])("phrases %#", (phrased, expected) => {
    expect(says(phrased)).toBe(expected);
  });
});
