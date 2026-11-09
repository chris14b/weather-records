import { describe, expect, test } from "vitest";
import { updateNote } from "../src/site/updates.ts";

describe("updateNote", () => {
  test.each([
    {
      case: "an evening update, before the morning one",
      generatedAt: "2026-11-09T11:41:00Z",
      now: "2026-11-09T12:00:00Z",
      expected:
        "Updated Monday 9 November at 10:41pm. Next update due around 10:30am tomorrow.",
    },
    {
      case: "an evening update, after midnight",
      generatedAt: "2026-11-09T11:41:00Z",
      now: "2026-11-09T14:00:00Z",
      expected:
        "Updated Monday 9 November at 10:41pm. Next update due around 10:30am.",
    },
    {
      case: "a morning update, before the evening one",
      generatedAt: "2026-11-09T23:36:00Z",
      now: "2026-11-10T11:29:00Z",
      expected:
        "Updated Tuesday 10 November at 10:36am. Next update due around 10:30pm.",
    },
    {
      case: "a morning update, once the evening one is due",
      generatedAt: "2026-11-09T23:36:00Z",
      now: "2026-11-10T11:30:00Z",
      expected:
        "Updated Tuesday 10 November at 10:36am. The 10:30pm update is running late.",
    },
    {
      case: "a morning update, once two updates are due",
      generatedAt: "2026-11-09T23:36:00Z",
      now: "2026-11-10T23:30:00Z",
      expected:
        "Updated Tuesday 10 November at 10:36am. Updates are running late.",
    },
    {
      case: "a manual update between runs",
      generatedAt: "2026-11-10T03:05:00Z",
      now: "2026-11-10T03:10:00Z",
      expected:
        "Updated Tuesday 10 November at 2:05pm. Next update due around 10:30pm.",
    },
    {
      case: "the evening before daylight saving starts",
      generatedAt: "2026-10-03T11:35:00Z",
      now: "2026-10-03T12:00:00Z",
      expected:
        "Updated Saturday 3 October at 9:35pm. Next update due around 10:30am tomorrow.",
    },
    {
      case: "the evening before daylight saving ends",
      generatedAt: "2027-04-03T11:35:00Z",
      now: "2027-04-03T12:00:00Z",
      expected:
        "Updated Saturday 3 April at 10:35pm. Next update due around 9:30am tomorrow.",
    },
  ])("for $case", ({ generatedAt, now, expected }) => {
    expect(updateNote(generatedAt, new Date(now))).toBe(expected);
  });
});
