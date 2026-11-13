import { describe, expect, test } from "vitest";
import {
  addDwoGusts,
  feedGusts,
  withoutRunningGust,
} from "../src/pipeline/gusts.ts";
import type { RunningValue } from "../src/pipeline/observations.ts";

const today = "2026-11-13";

const running = (measure: RunningValue["measure"], value: number) => ({
  measure,
  date: today,
  value,
  observedAt: "2026-11-13T11:30:00.000Z",
});

describe("feedGusts", () => {
  test("saves the running gust as its day's, leaving the DWO's blank", () => {
    expect(feedGusts([running("maxTemp", 27.4), running("gust", 61)])).toEqual([
      { date: today, feedGust: 61, dwoGust: null },
    ]);
  });
});

describe("withoutRunningGust", () => {
  test("leaves out the run's gust for the day still running", () => {
    const rows = [
      { date: "2026-11-12", feedGust: 52, dwoGust: null },
      { date: today, feedGust: 61, dwoGust: null },
    ];

    expect(withoutRunningGust(rows, [running("gust", 61)])).toEqual([
      { date: "2026-11-12", feedGust: 52, dwoGust: null },
      { date: today, feedGust: null, dwoGust: null },
    ]);
  });
});

describe("addDwoGusts", () => {
  const keptFrom = "2025-11-01";

  test("lets the DWO's gust win over the run's, which is only the strongest so far", () => {
    const saved = [{ date: "2026-11-12", feedGust: 52, dwoGust: null }];

    expect(
      addDwoGusts(saved, [{ date: "2026-11-12", gust: 67 }], keptFrom, today),
    ).toEqual([{ date: "2026-11-12", feedGust: 52, dwoGust: 67 }]);
  });

  test("fills a day the runs missed, and leaves a gust alone where the DWO is blank", () => {
    const saved = [{ date: "2026-11-11", feedGust: 40, dwoGust: 41 }];

    expect(
      addDwoGusts(
        saved,
        [
          { date: "2026-11-10", gust: 35 },
          { date: "2026-11-11", gust: null },
        ],
        keptFrom,
        today,
      ),
    ).toEqual([
      { date: "2026-11-10", feedGust: null, dwoGust: 35 },
      { date: "2026-11-11", feedGust: 40, dwoGust: 41 },
    ]);
  });

  test("leaves out today's, which is only the gust so far, and anything before `keptFrom`", () => {
    expect(
      addDwoGusts(
        [{ date: "2025-10-31", feedGust: 30, dwoGust: 31 }],
        [
          { date: "2025-10-30", gust: 44 },
          { date: today, gust: 39 },
        ],
        keptFrom,
        today,
      ),
    ).toEqual([]);
  });
});
