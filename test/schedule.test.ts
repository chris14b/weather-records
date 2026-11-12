import { describe, expect, test } from "vitest";
import { nextUpdate } from "../src/shared/schedule.ts";

describe("nextUpdate", () => {
  test.each([
    ["11am", "2026-11-09T00:00:00Z", "2026-11-09T01:30:00.000Z"],
    ["just before 12:30pm", "2026-11-09T01:29:59Z", "2026-11-09T01:30:00.000Z"],
    ["12:30pm", "2026-11-09T01:30:00Z", "2026-11-09T03:30:00.000Z"],
    ["8:30pm", "2026-11-09T09:30:00Z", "2026-11-09T11:30:00.000Z"],
    ["10:30pm", "2026-11-09T11:30:00Z", "2026-11-09T19:30:00.000Z"],
    ["midnight", "2026-11-09T13:00:00Z", "2026-11-09T19:30:00.000Z"],
    ["6:30am", "2026-11-09T19:30:00Z", "2026-11-09T21:30:00.000Z"],
    ["new year's eve", "2026-12-31T12:59:00Z", "2026-12-31T19:30:00.000Z"],
    [
      "10am without daylight saving",
      "2026-06-15T00:00:00Z",
      "2026-06-15T00:30:00.000Z",
    ],
    [
      "the night daylight saving starts",
      "2026-10-03T13:00:00Z",
      "2026-10-03T19:30:00.000Z",
    ],
    [
      "the night daylight saving ends",
      "2027-04-03T12:00:00Z",
      "2027-04-03T20:30:00.000Z",
    ],
  ])("after %s (%s) is %s", (_, instant, expected) => {
    expect(nextUpdate(new Date(instant)).toISOString()).toBe(expected);
  });
});
