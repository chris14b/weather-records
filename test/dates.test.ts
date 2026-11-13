import { describe, expect, test } from "vitest";
import {
  addDays,
  daysBetween,
  monthsBetween,
  sydneyDate,
  yearBefore,
} from "../src/pipeline/dates.ts";

describe("addDays", () => {
  test.each([
    ["2024-02-28", 1, "2024-02-29"],
    ["2026-12-31", 1, "2027-01-01"],
    ["2026-03-01", -1, "2026-02-28"],
  ])("%s plus %i is %s", (date, days, expected) => {
    expect(addDays(date, days)).toBe(expected);
  });
});

describe("yearBefore", () => {
  test.each([
    ["2026-11-13", "2025-11-13"],
    ["2028-02-29", "2027-02-28"],
    ["2026-01-01", "2025-01-01"],
  ])("a year before %s is %s", (date, expected) => {
    expect(yearBefore(date)).toBe(expected);
  });
});

describe("daysBetween", () => {
  test.each([
    ["2024-02-28", "2024-03-01", 2],
    ["2026-12-31", "2027-01-01", 1],
    ["2026-03-01", "2026-02-28", -1],
  ])("from %s to %s is %i", (from, to, expected) => {
    expect(daysBetween(from, to)).toBe(expected);
  });
});

describe("monthsBetween", () => {
  test("lists every month across a year end", () => {
    expect(monthsBetween("2026-11", "2027-02")).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
  });

  test("is empty when the first month is after the last", () => {
    expect(monthsBetween("2026-11", "2026-10")).toEqual([]);
  });
});

describe("sydneyDate", () => {
  test.each([
    ["2026-10-30T12:59:00Z", "2026-10-30"],
    ["2026-10-30T13:00:00Z", "2026-10-31"],
    ["2026-06-30T13:59:00Z", "2026-06-30"],
    ["2026-06-30T14:00:00Z", "2026-07-01"],
  ])("%s is %s in Sydney", (instant, expected) => {
    expect(sydneyDate(new Date(instant))).toBe(expected);
  });
});
