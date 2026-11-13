import { describe, expect, test } from "vitest";
import type { LayeredRecord } from "../src/pipeline/layering.ts";
import {
  changeSeries,
  columnSeries,
  layeredSeries,
  rangeSeries,
  type Series,
  windSeries,
} from "../src/pipeline/series.ts";

function record(
  date: string,
  value: number,
  overrides: Partial<LayeredRecord> = {},
): LayeredRecord {
  return {
    date,
    measure: "rain",
    value,
    periodDays: 1,
    quality: "Y",
    station: "066037",
    source: "zip",
    ...overrides,
  };
}

describe("layeredSeries", () => {
  test("keeps single-day values, marking the snapshot's as provisional", () => {
    const series = layeredSeries("rain", [
      record("2026-10-30", 1.2),
      record("2026-10-31", 0, { source: "ftp", quality: null }),
      record("2026-11-01", 4.6, { source: "snapshot", quality: null }),
    ]);

    expect(series).toEqual({
      measure: "rain",
      days: [
        { date: "2026-10-30", value: 1.2, status: "confirmed" },
        { date: "2026-10-31", value: 0, status: "confirmed" },
        { date: "2026-11-01", value: 4.6, status: "provisional" },
      ],
      multiDay: [],
      fullRecord: true,
    });
  });

  test("keeps multi-day totals apart and leaves out zero-day periods", () => {
    const series = layeredSeries("rain", [
      record("2026-03-17", 0.2),
      record("2026-03-20", 22.2, { periodDays: 3 }),
      record("2026-03-21", 0, { periodDays: 0 }),
      record("2026-03-22", 1.4),
    ]);

    expect(series.days.map(({ date }) => date)).toEqual([
      "2026-03-17",
      "2026-03-22",
    ]);
    expect(series.multiDay).toEqual([
      {
        from: "2026-03-18",
        date: "2026-03-20",
        value: 22.2,
        status: "confirmed",
      },
    ]);
  });

  test("keeps a blank period only on a series' first day or after a recorded day", () => {
    const series = layeredSeries("maxTemp", [
      record("1859-01-01", 24.1, { periodDays: null }),
      record("1859-01-02", 25.3, { periodDays: null }),
      record("1859-01-05", 31.8, { periodDays: null }),
      record("1859-01-06", 26.0, { periodDays: null }),
    ]);

    expect(series.days.map(({ date }) => date)).toEqual([
      "1859-01-01",
      "1859-01-02",
      "1859-01-06",
    ]);
  });

  test("leaves out a multi-day value even on a series' first day", () => {
    const series = layeredSeries("rain", [
      record("1858-07-02", 8.1, { periodDays: 2 }),
      record("1858-07-03", 0),
    ]);

    expect(series.days.map(({ date }) => date)).toEqual(["1858-07-03"]);
  });
});

describe("rangeSeries", () => {
  const max: Series = {
    measure: "maxTemp",
    days: [
      { date: "2026-11-01", value: 25.3, status: "confirmed" },
      { date: "2026-11-02", value: 27.1, status: "provisional" },
      { date: "2026-11-03", value: 22.0, status: "confirmed" },
    ],
    fullRecord: true,
  };
  const min: Series = {
    measure: "minTemp",
    days: [
      { date: "2026-11-01", value: 14.1, status: "confirmed" },
      { date: "2026-11-02", value: 16.4, status: "confirmed" },
    ],
    fullRecord: true,
  };

  test("subtracts each day's minimum from its maximum, on days with both", () => {
    expect(rangeSeries(max, min)).toEqual({
      measure: "range",
      days: [
        { date: "2026-11-01", value: 11.2, status: "confirmed" },
        { date: "2026-11-02", value: 10.7, status: "provisional" },
      ],
      fullRecord: true,
    });
  });
});

describe("changeSeries", () => {
  test("subtracts the day before's value, naming the series after its measure", () => {
    const max: Series<"maxTemp"> = {
      measure: "maxTemp",
      days: [
        { date: "2026-10-11", value: 27.2, status: "confirmed" },
        { date: "2026-10-12", value: 34.8, status: "confirmed" },
        { date: "2026-10-13", value: 19.9, status: "confirmed" },
      ],
      fullRecord: true,
    };

    expect(changeSeries(max)).toEqual({
      measure: "maxTempChange",
      days: [
        { date: "2026-10-12", value: 7.6, status: "confirmed" },
        { date: "2026-10-13", value: -14.9, status: "confirmed" },
      ],
      fullRecord: true,
    });
  });

  test("leaves out the day of a gap and the day after it", () => {
    const min: Series<"minTemp"> = {
      measure: "minTemp",
      days: [
        { date: "2026-10-01", value: 14.0, status: "confirmed" },
        { date: "2026-10-02", value: 15.5, status: "confirmed" },
        { date: "2026-10-04", value: 13.0, status: "confirmed" },
        { date: "2026-10-05", value: 13.5, status: "confirmed" },
      ],
      fullRecord: true,
    };

    expect(changeSeries(min)).toEqual({
      measure: "minTempChange",
      days: [
        { date: "2026-10-02", value: 1.5, status: "confirmed" },
        { date: "2026-10-05", value: 0.5, status: "confirmed" },
      ],
      fullRecord: true,
    });
  });

  test("marks a change provisional if either day's value is", () => {
    const min: Series<"minTemp"> = {
      measure: "minTemp",
      days: [
        { date: "2026-11-01", value: 14.1, status: "confirmed" },
        { date: "2026-11-02", value: 16.4, status: "provisional" },
        { date: "2026-11-03", value: 12.0, status: "confirmed" },
      ],
      fullRecord: true,
    };

    expect(changeSeries(min).days.map(({ status }) => status)).toEqual([
      "provisional",
      "provisional",
    ]);
  });
});

describe("columnSeries", () => {
  test("takes one column's values, skipping missing ones, as a series that starts after records began", () => {
    const rows = [
      { date: "2026-10-30", temp9am: 18.2, relHum9am: 71 },
      { date: "2026-10-31", temp9am: null, relHum9am: 65 },
    ];

    expect(columnSeries("temp9am", rows)).toEqual({
      measure: "temp9am",
      days: [{ date: "2026-10-30", value: 18.2, status: "confirmed" }],
      fullRecord: false,
    });
  });
});

describe("windSeries", () => {
  test("turns the daily files' m/s into km/h, to 0.1 km/h", () => {
    const series = columnSeries("wind", [
      { date: "2015-04-21", wind: 18.54 },
      { date: "2015-04-22", wind: 7.11 },
      { date: "2015-04-23", wind: null },
    ]);

    expect(windSeries(series).days.map(({ value }) => value)).toEqual([
      66.7, 25.6,
    ]);
  });
});
