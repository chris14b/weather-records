import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { nextUpdate, updateRunsUtc } from "../src/shared/schedule.ts";

describe("updateRunsUtc", () => {
  test("matches the update workflow's schedule", async () => {
    const workflow = await readFile(".github/workflows/update.yml", "utf8");
    const crons = [...workflow.matchAll(/cron: "(\d+) (\d+) \* \* \*"/g)].map(
      ([, minute, hour]) => Number(hour) * 60 + Number(minute),
    );

    expect(crons.toSorted((a, b) => a - b)).toEqual(updateRunsUtc);
  });
});

describe("nextUpdate", () => {
  test.each([
    ["2026-11-09T00:00:00Z", "2026-11-09T11:30:00.000Z"],
    ["2026-11-09T11:29:59Z", "2026-11-09T11:30:00.000Z"],
    ["2026-11-09T11:30:00Z", "2026-11-09T23:30:00.000Z"],
    ["2026-11-09T11:41:00Z", "2026-11-09T23:30:00.000Z"],
    ["2026-11-09T23:29:00Z", "2026-11-09T23:30:00.000Z"],
    ["2026-11-09T23:30:00Z", "2026-11-10T11:30:00.000Z"],
    ["2026-11-09T23:45:00Z", "2026-11-10T11:30:00.000Z"],
    ["2026-12-31T23:59:00Z", "2027-01-01T11:30:00.000Z"],
  ])("after %s is %s", (instant, expected) => {
    expect(nextUpdate(new Date(instant)).toISOString()).toBe(expected);
  });
});
