import { describe, expect, test } from "vitest";
import type { RecentDay } from "../src/pipeline/daily-files.ts";
import type { DailyRecord } from "../src/pipeline/history.ts";
import { layerRecent, type RecentLayer } from "../src/pipeline/layering.ts";
import type { FromStation } from "../src/pipeline/stations.ts";

function zipDay(date: string, value: number): FromStation<DailyRecord> {
  return {
    date,
    measure: "maxTemp",
    value,
    periodDays: 1,
    quality: "N",
    station: "066214",
  };
}

function recentDay(
  date: string,
  maxTemp: number | null,
  station = "066214",
): FromStation<RecentDay> {
  return { date, rain: 0, maxTemp, minTemp: 10, station };
}

const history = [zipDay("2026-10-28", 24.4), zipDay("2026-10-30", 24.6)];

describe("layerRecent", () => {
  test("keeps the history and adds the recent days after it, recording each source", () => {
    const ftp: RecentLayer = {
      source: "ftp",
      days: [recentDay("2026-10-31", 25.1), recentDay("2026-11-01", 26.2)],
    };
    const snapshot: RecentLayer = {
      source: "snapshot",
      days: [recentDay("2026-11-02", 27.3, "066214")],
    };

    expect(layerRecent("maxTemp", history, [ftp, snapshot])).toEqual([
      { ...history[0], source: "zip" },
      { ...history[1], source: "zip" },
      {
        date: "2026-10-31",
        measure: "maxTemp",
        value: 25.1,
        periodDays: 1,
        quality: null,
        station: "066214",
        source: "ftp",
      },
      expect.objectContaining({ date: "2026-11-01", source: "ftp" }),
      expect.objectContaining({ date: "2026-11-02", source: "snapshot" }),
    ]);
  });

  test("lets the ZIPs win for every date they cover, even a missing one", () => {
    const ftp: RecentLayer = {
      source: "ftp",
      days: [
        recentDay("2026-10-28", 99),
        recentDay("2026-10-29", 99),
        recentDay("2026-10-30", 99),
        recentDay("2026-10-31", 25.1),
      ],
    };

    const layered = layerRecent("maxTemp", history, [ftp]);

    expect(layered.map((r) => [r.date, r.value, r.source])).toEqual([
      ["2026-10-28", 24.4, "zip"],
      ["2026-10-30", 24.6, "zip"],
      ["2026-10-31", 25.1, "ftp"],
    ]);
  });

  test("prefers the daily files to the snapshots", () => {
    const ftp: RecentLayer = {
      source: "ftp",
      days: [recentDay("2026-10-31", 25.1)],
    };
    const snapshot: RecentLayer = {
      source: "snapshot",
      days: [recentDay("2026-10-31", 24.8)],
    };

    expect(
      layerRecent("maxTemp", history, [ftp, snapshot]).at(-1),
    ).toMatchObject({
      value: 25.1,
      source: "ftp",
    });
  });

  test("takes a snapshot's value where the daily file has none", () => {
    const ftp: RecentLayer = {
      source: "ftp",
      days: [recentDay("2026-10-31", null)],
    };
    const snapshot: RecentLayer = {
      source: "snapshot",
      days: [recentDay("2026-10-31", 24.8)],
    };

    expect(
      layerRecent("maxTemp", history, [ftp, snapshot]).at(-1),
    ).toMatchObject({
      value: 24.8,
      source: "snapshot",
    });
  });

  test("leaves a day missing when no source has a value", () => {
    const ftp: RecentLayer = {
      source: "ftp",
      days: [recentDay("2026-10-31", null), recentDay("2026-11-01", 26.2)],
    };

    const dates = layerRecent("maxTemp", history, [ftp]).map((r) => r.date);

    expect(dates).toEqual(["2026-10-28", "2026-10-30", "2026-11-01"]);
  });

  test("reads the measure asked for", () => {
    const rainHistory = [
      { ...zipDay("2026-10-30", 0), measure: "rain" as const },
    ];
    const ftp: RecentLayer = {
      source: "ftp",
      days: [
        {
          date: "2026-10-31",
          rain: 12.4,
          maxTemp: 25.1,
          minTemp: 10,
          station: "066214",
        },
      ],
    };

    expect(layerRecent("rain", rainHistory, [ftp]).at(-1)).toMatchObject({
      measure: "rain",
      value: 12.4,
    });
  });

  test("accepts no recent data", () => {
    expect(
      layerRecent("maxTemp", history, [{ source: "ftp", days: [] }]),
    ).toHaveLength(2);
  });

  test("fails when the recent data starts after a gap", () => {
    const ftp: RecentLayer = {
      source: "ftp",
      days: [recentDay("2026-11-01", 26.2)],
    };

    expect(() => layerRecent("maxTemp", history, [ftp])).toThrow(
      "Gap in maxTemp at station 066214: the ZIP history ends on 2026-10-30, but the recent data starts on 2026-11-01",
    );
  });

  test("counts a recent day with no values as covering its date", () => {
    const ftp: RecentLayer = {
      source: "ftp",
      days: [recentDay("2026-10-31", null), recentDay("2026-11-01", 26.2)],
    };

    expect(() => layerRecent("maxTemp", history, [ftp])).not.toThrow();
  });

  test("fails when there is no history", () => {
    expect(() => layerRecent("maxTemp", [], [])).toThrow(
      "There is no maxTemp history",
    );
  });
});
