import { describe, expect, test } from "vitest";
import type { ForecastDay } from "../src/pipeline/forecast.ts";
import type { RunningValue } from "../src/pipeline/observations.ts";
import type { Series } from "../src/pipeline/series.ts";
import { temperatureSwing } from "../src/pipeline/swing.ts";

const day = (
  date: string,
  temps: Pick<ForecastDay, "minTemp" | "maxTemp">,
): ForecastDay => ({
  date,
  ...temps,
  rainChance: null,
  rain50: null,
  rain25: null,
  iconCode: null,
  precis: null,
});

const running = (
  measure: RunningValue["measure"],
  date: string,
  value: number,
): RunningValue => ({
  measure,
  date,
  value,
  observedAt: "2026-11-16T03:30:00.000Z",
});

const series: Series[] = [
  {
    measure: "maxTemp",
    fullRecord: true,
    days: [{ date: "2026-11-15", value: 24, status: "provisional" }],
  },
  {
    measure: "minTemp",
    fullRecord: true,
    days: [{ date: "2026-11-16", value: 17.2, status: "provisional" }],
  },
];

const tomorrow = day("2026-11-17", { minTemp: 19, maxTemp: 32 });

/** A time in Sydney on 16 November 2026, during daylight saving. */
const at = (local: string) => new Date(`2026-11-16T${local}+11:00`);

const todayWithHigh = day("2026-11-16", { minTemp: null, maxTemp: 29 });

describe("temperatureSwing", () => {
  test("follows the day's rise from 6am", () => {
    expect(
      temperatureSwing({
        now: at("14:30"),
        forecast: [todayWithHigh, tomorrow],
        series,
        running: [running("maxTemp", "2026-11-16", 26.4)],
      }),
    ).toEqual({
      measure: "maxTemp",
      date: "2026-11-16",
      from: 17.2,
      current: 26.4,
      forecast: 29,
    });
  });

  test("starts the day from last night's minimum while it is still running", () => {
    expect(
      temperatureSwing({
        now: at("06:30"),
        forecast: [todayWithHigh],
        series: [],
        running: [
          running("minTemp", "2026-11-16", 17.4),
          running("maxTemp", "2026-11-16", 17.6),
        ],
      }),
    ).toMatchObject({ measure: "maxTemp", from: 17.4, current: 17.6 });
  });

  test("keeps the day without a forecast once the afternoon issue has dropped today's maximum", () => {
    expect(
      temperatureSwing({
        now: at("16:30"),
        forecast: [
          day("2026-11-16", { minTemp: null, maxTemp: null }),
          tomorrow,
        ],
        series,
        running: [running("maxTemp", "2026-11-16", 27.9)],
      }),
    ).toEqual({
      measure: "maxTemp",
      date: "2026-11-16",
      from: 17.2,
      current: 27.9,
      forecast: null,
    });
  });

  test("follows tonight's fall from 6pm", () => {
    expect(
      temperatureSwing({
        now: at("18:30"),
        forecast: [
          day("2026-11-16", { minTemp: null, maxTemp: null }),
          tomorrow,
        ],
        series,
        running: [
          running("maxTemp", "2026-11-16", 28.6),
          running("minTemp", "2026-11-17", 25.3),
        ],
      }),
    ).toEqual({
      measure: "minTemp",
      date: "2026-11-17",
      from: 28.6,
      current: 25.3,
      forecast: 19,
    });
  });

  test("follows the night under way after midnight, until 6am", () => {
    expect(
      temperatureSwing({
        now: at("03:00"),
        forecast: [day("2026-11-16", { minTemp: 18, maxTemp: 29 }), tomorrow],
        series,
        running: [running("minTemp", "2026-11-16", 20.5)],
      }),
    ).toEqual({
      measure: "minTemp",
      date: "2026-11-16",
      from: 24,
      current: 20.5,
      forecast: 18,
    });
  });

  test("leaves out what isn't known", () => {
    expect(
      temperatureSwing({
        now: at("21:00"),
        forecast: [],
        series: [],
        running: [],
      }),
    ).toEqual({
      measure: "minTemp",
      date: "2026-11-17",
      from: null,
      current: null,
      forecast: null,
    });
  });
});
