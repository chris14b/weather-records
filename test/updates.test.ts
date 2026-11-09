import { describe, expect, test } from "vitest";
import { updateNote } from "../src/site/updates.ts";

describe("updateNote", () => {
  test.each([
    {
      case: "the evening's last update, before the morning's first",
      generatedAt: "2026-11-09T11:36:00Z",
      now: "2026-11-09T12:00:00Z",
      expected:
        "Updated Monday 9 November at 10:36pm. Next update due around 6:30am tomorrow.",
    },
    {
      case: "the evening's last update, after midnight",
      generatedAt: "2026-11-09T11:36:00Z",
      now: "2026-11-09T14:00:00Z",
      expected:
        "Updated Monday 9 November at 10:36pm. Next update due around 6:30am.",
    },
    {
      case: "a morning update, before the next one",
      generatedAt: "2026-11-09T23:36:00Z",
      now: "2026-11-10T01:29:00Z",
      expected:
        "Updated Tuesday 10 November at 10:36am. Next update due around 12:30pm.",
    },
    {
      case: "a morning update, once the next one is due",
      generatedAt: "2026-11-09T23:36:00Z",
      now: "2026-11-10T01:30:00Z",
      expected:
        "Updated Tuesday 10 November at 10:36am. The 12:30pm update is running late.",
    },
    {
      case: "a morning update, once two updates are due",
      generatedAt: "2026-11-09T23:36:00Z",
      now: "2026-11-10T03:30:00Z",
      expected:
        "Updated Tuesday 10 November at 10:36am. Updates are running late.",
    },
    {
      case: "a manual update between runs",
      generatedAt: "2026-11-10T03:05:00Z",
      now: "2026-11-10T03:10:00Z",
      expected:
        "Updated Tuesday 10 November at 2:05pm. Next update due around 2:30pm.",
    },
    {
      case: "the evening before daylight saving starts",
      generatedAt: "2026-10-03T12:35:00Z",
      now: "2026-10-03T13:00:00Z",
      expected:
        "Updated Saturday 3 October at 10:35pm. Next update due around 6:30am tomorrow.",
    },
    {
      case: "the evening before daylight saving ends",
      generatedAt: "2027-04-03T11:35:00Z",
      now: "2027-04-03T12:00:00Z",
      expected:
        "Updated Saturday 3 April at 10:35pm. Next update due around 6:30am tomorrow.",
    },
  ])("for $case", ({ generatedAt, now, expected }) => {
    expect(updateNote(generatedAt, new Date(now))).toBe(expected);
  });
});
