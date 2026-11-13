import { describe, expect, test } from "vitest";
import type { DaylightFact } from "../src/shared/facts.ts";
import {
  amount,
  clockTime,
  dayName,
  daylightSentence,
  duration,
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
    ["2026-11-02", "2\u00a0November"],
    ["2026-11-15", "Sunday"],
    ["2026-11-16", "16\u00a0November"],
    ["2025-12-31", "31\u00a0December 2025"],
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
    ["2026-11-03", "the night of 2\u00a0November"],
    ["2026-01-01", "the night of 31\u00a0December 2025"],
  ])("names the night that ends on %s", (date, expected) => {
    expect(nightName(date, today)).toBe(expected);
  });
});

describe("amount", () => {
  test.each([
    ["maxTemp", 23, false, "23.0\u00a0°C"],
    ["minTemp", 11.6, false, "11.6\u00a0°C"],
    ["minTemp", 12, true, "12\u00a0°C"],
    ["rain", 1234.5, false, "1,234.5\u00a0mm"],
    ["relHum3pm", 31, false, "31%"],
    ["solar", 27.54, false, "27.5\u00a0MJ/m²"],
    ["wind", 25.6, false, "25.6\u00a0km/h"],
    ["maxTempChange", -14.9, false, "14.9\u00a0°C"],
  ] as const)("writes %s %d", (measure, value, forecast, expected) => {
    expect(amount(measure, value, forecast)).toBe(expected);
  });
});

describe("longDate", () => {
  test.each([
    ["2026-11-09", "Monday 9\u00a0November 2026"],
    ["2026-11-15", "Sunday 15\u00a0November 2026"],
    ["1970-01-01", "Thursday 1\u00a0January 1970"],
    ["1939-01-14", "Saturday 14\u00a0January 1939"],
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
      "the 24 hours to 9\u00a0am Wednesday",
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
      "[Today] is the hottest day since records began in 1859, with a top of 45.8\u00a0°C",
    ],
    [
      fact({
        date: "2026-11-05",
        text: "the coldest day since 27\u00a0October",
      }),
      "[Thursday] was the coldest day since 27\u00a0October, with a top of 45.8\u00a0°C",
    ],
    [
      fact({
        measure: "minTemp",
        direction: "lowest",
        status: "provisional",
        text: "the coldest since 15\u00a0October",
        why: { value: 11.6 },
      }),
      "[Last night] was the coldest since 15\u00a0October, with a low of 11.6\u00a0°C",
    ],
    [
      fact({ status: "partial", why: { value: 31.2 } }),
      "[Today] is the hottest day since records began in 1859, with a top of 31.2\u00a0°C",
    ],
    [
      fact({
        measure: "minTemp",
        direction: "lowest",
        status: "partial",
        text: "the coldest since 15\u00a0October",
        why: { value: 9.8 },
      }),
      "[Sunday night] is the coldest since 15\u00a0October, with a low of 9.8\u00a0°C",
    ],
    [
      fact({
        date: "2026-11-10",
        measure: "minTemp",
        direction: "lowest",
        status: "partial",
        text: "the coldest since 15\u00a0October",
        why: { value: 9.8 },
      }),
      "[Tonight] is the coldest since 15\u00a0October, with a low of 9.8\u00a0°C",
    ],
    [
      fact({
        measure: "rain",
        status: "partial",
        text: "the wettest since 16\u00a0October",
        why: { value: 22.4 },
      }),
      "[The 24 hours to 9\u00a0am today] are the wettest since 16\u00a0October, with 22.4\u00a0mm",
    ],
    [
      fact({
        date: "2026-11-06",
        measure: "minTemp",
        direction: "lowest",
        text: "the coldest in November since 2024",
        why: { value: 14.3 },
      }),
      "[Thursday night] was the coldest in November since 2024, with a low of 14.3\u00a0°C",
    ],
    [
      fact({
        measure: "rain",
        text: "the wettest since 16\u00a0October",
        why: { value: 22.4 },
      }),
      "[The 24 hours to 9\u00a0am today] were the wettest since 16\u00a0October, with 22.4\u00a0mm",
    ],
    [
      fact({
        date: "2026-11-07",
        measure: "maxTempChange",
        text: "the biggest day-to-day rise in maximum temperature in November since 2024",
        why: { value: 6.7 },
      }),
      "[Saturday] had the biggest day-to-day rise in maximum temperature in November since 2024, up 6.7\u00a0°C",
    ],
    [
      fact({
        measure: "minTempChange",
        text: "the biggest day-to-day rise in minimum temperature since 1\u00a0November",
        why: { value: 2.2 },
      }),
      "[Today] had the biggest day-to-day rise in minimum temperature since 1\u00a0November, up 2.2\u00a0°C",
    ],
    [
      fact({
        measure: "maxTempChange",
        text: "the biggest day-to-day rise in maximum temperature since 1\u00a0November",
        why: { value: 3.1 },
      }),
      "[Today] has the biggest day-to-day rise in maximum temperature since 1\u00a0November, up 3.1\u00a0°C",
    ],
    [
      fact({
        measure: "minRelHum",
        text: "the most humid day since 3\u00a0March",
        why: { value: 82 },
      }),
      "[Today] is the most humid day since 3\u00a0March, never below 82%",
    ],
    [
      fact({
        date: "2026-11-07",
        measure: "wind",
        text: "the windiest day since 2015",
        why: { value: 52.3 },
      }),
      "[Saturday] was the windiest day since 2015, with an average wind speed of 52.3\u00a0km/h",
    ],
    [
      fact({
        date: "2026-11-10",
        status: "forecast",
        direction: "lowest",
        text: "the coldest November day since 2022",
        why: { value: 20 },
      }),
      "[Tomorrow] is forecast to be the coldest November day since 2022, with a top of 20\u00a0°C",
    ],
    [
      fact({
        date: "2026-11-10",
        measure: "minTemp",
        direction: "lowest",
        status: "conditional",
        text: "the coldest night in November since 2006",
        why: { value: 10, forecast: 12 },
      }),
      "A low of 10\u00a0°C [tonight] (forecast 12\u00a0°C) would make it the coldest night in November since 2006",
    ],
    [
      fact({
        date: "2026-11-09",
        measure: "minTemp",
        status: "forecast",
        text: "the warmest in November since 2014",
        why: { value: 23 },
      }),
      "[Sunday night] is forecast to be the warmest in November since 2014, with a low of 23\u00a0°C",
    ],
    [
      fact({
        date: "2026-11-12",
        status: "conditional",
        text: "the hottest November day since records began in 1859",
        why: { value: 36.6, forecast: 35 },
      }),
      "A top of 36.6\u00a0°C on [Thursday] (forecast 35\u00a0°C) would make it the hottest November day since records began in 1859",
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
      "90.1\u00a0mm in [the 7 days to 16\u00a0November] (forecast 70\u00a0mm) would make them the wettest since 2022",
    ],
    [
      fact({
        date: "2026-11-10",
        measure: "rain",
        status: "forecast",
        text: "the wettest since 14\u00a0October",
        why: { value: 24 },
      }),
      "[The 24 hours to 9\u00a0am tomorrow] are forecast to be the wettest since 14\u00a0October, with 24\u00a0mm",
    ],
    [
      fact({
        date: "2026-11-10",
        measure: "rain",
        status: "conditional",
        text: "the wettest in November since 2022",
        why: { value: 30, forecast: 20 },
      }),
      "[The 24 hours to 9\u00a0am tomorrow] have a 25% chance of being the wettest in November since 2022, with 30\u00a0mm or more",
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
      "[The 3 days to Saturday] were the wettest since records began in 1859, with 120.4\u00a0mm",
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
      "[October] was the wettest since records began in 1859, with 300.0\u00a0mm",
    ],
    [
      fact({
        period: { kind: "year", toDate: true },
        from: "2026-01-01",
        date: "2026-11-07",
        text: "so far the third hottest year since records began in 1859",
        why: { value: 23.6 },
      }),
      "[2026] is so far the third hottest year since records began in 1859, with an average top of 23.6\u00a0°C",
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
      "[November so far] has had the warmest nights since 2009, with an average low of 17.2\u00a0°C",
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
      "[2026] has so far had the warmest nights since records began in 1859, with an average low of 15.0\u00a0°C",
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
      "[July] was the month with the coldest nights since July 2024, with an average low of 6.1\u00a0°C",
    ],
    [
      fact({
        date: "2026-11-05",
        measure: "maxRelHum",
        direction: "lowest",
        text: "the lowest peak humidity since 27\u00a0October",
        why: { value: 78 },
      }),
      "[Thursday] had the lowest peak humidity since 27\u00a0October, at 78%",
    ],
    [
      fact({
        measure: "range",
        direction: "lowest",
        text: "the smallest temperature range since 8\u00a0February",
        why: { value: 1.3 },
      }),
      "[Today] has the smallest temperature range since 8\u00a0February, at 1.3\u00a0°C",
    ],
  ])("phrases %#", (phrased, expected) => {
    expect(says(phrased)).toBe(expected);
  });

  const onDayOfWeek = (changes: Partial<Phrased>) =>
    fact({ comparison: "dayOfWeek", ...changes });

  test.each([
    [
      onDayOfWeek({
        date: "2026-11-08",
        text: "the hottest Sunday since 2019",
      }),
      "[Yesterday] was the hottest Sunday since 2019, with a top of 45.8\u00a0°C",
    ],
    [
      onDayOfWeek({
        date: "2026-11-05",
        text: "the hottest Thursday since 2019",
      }),
      "[5\u00a0November] was the hottest Thursday since 2019, with a top of 45.8\u00a0°C",
    ],
    [
      onDayOfWeek({
        date: "2026-11-14",
        status: "forecast",
        text: "the hottest Saturday since 2019",
        why: { value: 36 },
      }),
      "[14\u00a0November] is forecast to be the hottest Saturday since 2019, with a top of 36\u00a0°C",
    ],
    [
      onDayOfWeek({
        date: "2026-11-12",
        status: "conditional",
        text: "the hottest Thursday since 2019",
        why: { value: 36.6, forecast: 35 },
      }),
      "A top of 36.6\u00a0°C on [12\u00a0November] (forecast 35\u00a0°C) would make it the hottest Thursday since 2019",
    ],
    [
      onDayOfWeek({
        measure: "minTemp",
        direction: "lowest",
        text: "the coldest Sunday night since 2019",
        why: { value: 9.8 },
      }),
      "[Last night] was the coldest Sunday night since 2019, with a low of 9.8\u00a0°C",
    ],
    [
      onDayOfWeek({
        date: "2026-11-06",
        measure: "minTemp",
        direction: "lowest",
        text: "the coldest Thursday night since 2019",
        why: { value: 9.8 },
      }),
      "[The night of 5\u00a0November] was the coldest Thursday night since 2019, with a low of 9.8\u00a0°C",
    ],
    [
      onDayOfWeek({
        measure: "minTemp",
        direction: "lowest",
        status: "forecast",
        text: "the coldest Sunday night since 2019",
        why: { value: 9 },
      }),
      "[The night of 8\u00a0November] is forecast to be the coldest Sunday night since 2019, with a low of 9\u00a0°C",
    ],
    [
      onDayOfWeek({
        date: "2026-11-07",
        measure: "rain",
        text: "the wettest from a Friday since 2022",
        why: { value: 30.2 },
      }),
      "[The 24 hours to 9\u00a0am Saturday] were the wettest from a Friday since 2022, with 30.2\u00a0mm",
    ],
  ])(
    "doesn't name a day by the day of the week it is compared with: %#",
    (phrased, expected) => {
      expect(says(phrased)).toBe(expected);
    },
  );
});

describe("clockTime", () => {
  test.each([
    ["2026-12-21T18:41:00Z", "5:41\u00a0am"],
    ["2027-01-07T09:10:00Z", "8:10\u00a0pm"],
    ["2026-06-21T06:54:00Z", "4:54\u00a0pm"],
    ["2026-06-21T02:00:00Z", "midday"],
    ["2026-06-20T14:00:00Z", "midnight"],
    ["2026-06-20T14:01:00Z", "12:01\u00a0am"],
  ])("shows %s on Sydney's clocks as %s", (instant, expected) => {
    expect(clockTime(instant)).toBe(expected);
  });
});

describe("duration", () => {
  test.each([
    [865, "14 hours 25 minutes"],
    [600, "10 hours"],
    [61, "1 hour 1 minute"],
    [45, "45 minutes"],
  ])("words %d minutes as %s", (minutes, expected) => {
    expect(duration(minutes)).toBe(expected);
  });
});

describe("daylightSentence", () => {
  const daylight = (changes: Partial<DaylightFact> = {}): DaylightFact => ({
    kind: "daylight",
    date: "2026-12-22",
    event: "longestDay",
    scope: "year",
    sunrise: "2026-12-21T18:41:00.000Z",
    sunset: "2026-12-22T09:06:00.000Z",
    score: 4.11,
    text: "the longest day of the year",
    ...changes,
  });
  const words = (fact: DaylightFact, viewed: string) => {
    const { before, subject, after } = daylightSentence(fact, viewed);
    return `${before}${subject}${after}`;
  };

  test.each([
    [
      "2026-12-22",
      "Today is the longest day of the year, with 14 hours 25 minutes of daylight",
    ],
    [
      "2026-12-19",
      "Tuesday is the longest day of the year, with 14 hours 25 minutes of daylight",
    ],
    [
      "2026-12-24",
      "Tuesday was the longest day of the year, with 14 hours 25 minutes of daylight",
    ],
  ])("gives a solstice's daylight, viewed on %s", (viewed, expected) => {
    expect(words(daylight(), viewed)).toBe(expected);
  });

  test("gives a sunrise's time", () => {
    const fact = daylight({
      date: "2026-12-06",
      event: "earliestSunrise",
      scope: "season",
      sunrise: "2026-12-05T18:37:00.000Z",
      sunset: "2026-12-06T08:55:00.000Z",
      text: "the earliest sunrise of summer",
    });

    expect(words(fact, "2026-12-06")).toBe(
      "Today has the earliest sunrise of summer, at 5:37\u00a0am",
    );
    expect(words(fact, "2026-12-07")).toBe(
      "Yesterday had the earliest sunrise of summer, at 5:37\u00a0am",
    );
  });

  test("gives a sunset's time", () => {
    const fact = daylight({
      date: "2027-01-07",
      event: "latestSunset",
      sunrise: "2027-01-06T18:52:00.000Z",
      sunset: "2027-01-07T09:10:00.000Z",
      text: "the latest sunset of the year",
    });

    expect(words(fact, "2027-01-04")).toBe(
      "Thursday has the latest sunset of the year, at 8:10\u00a0pm",
    );
  });
});
