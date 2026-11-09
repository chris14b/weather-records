import { describe, expect, test } from "vitest";
import {
  sydneyInstant,
  sydneyOffsetMinutes,
} from "../src/shared/sydney-time.ts";

describe("sydneyOffsetMinutes", () => {
  test.each([
    ["2026-07-01T00:00:00Z", 600],
    ["2026-12-01T00:00:00Z", 660],
    ["2026-10-03T15:59:00Z", 600],
    ["2026-10-03T16:00:00Z", 660],
  ])("gives Sydney's offset at %s", (instant, expected) => {
    expect(sydneyOffsetMinutes(new Date(instant))).toBe(expected);
  });
});

describe("sydneyInstant", () => {
  test.each([
    ["2026-07-01", 7 * 60, "2026-06-30T21:00:00.000Z"],
    ["2026-12-21", 20 * 60 + 5, "2026-12-21T09:05:00.000Z"],
    ["2026-10-04", 60, "2026-10-03T15:00:00.000Z"],
    ["2026-10-04", 3 * 60, "2026-10-03T16:00:00.000Z"],
  ])("gives the instant of %s at minute %d", (date, minutes, expected) => {
    expect(sydneyInstant(date, minutes).toISOString()).toBe(expected);
  });
});
