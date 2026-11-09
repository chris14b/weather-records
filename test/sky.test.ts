import { describe, expect, test } from "vitest";
import type { DayForecast } from "../src/shared/facts.ts";
import { forecastWeather, skyPhase, sydneyHour } from "../src/site/sky.ts";

describe("sydneyHour", () => {
  test.each([
    ["2026-11-08T18:30:00Z", 5],
    ["2026-07-08T18:30:00Z", 4],
    ["2026-11-09T13:00:00Z", 0],
  ])("gives Sydney's hour at %s", (instant, hour) => {
    expect(sydneyHour(new Date(instant))).toBe(hour);
  });
});

describe("skyPhase", () => {
  test.each([
    [0, "night"],
    [5, "dawn"],
    [7, "day"],
    [16, "day"],
    [17, "dusk"],
    [20, "night"],
  ])("shows hour %d as %s", (hour, phase) => {
    expect(skyPhase(hour)).toBe(phase);
  });
});

describe("forecastWeather", () => {
  const day = (date: string, iconCode: number | null): DayForecast => ({
    date,
    iconCode,
    precis: null,
  });
  const forecast = [day("2026-11-09", 3), day("2026-11-10", 16)];

  test("gives the sky for the day's icon", () => {
    expect(forecastWeather(forecast, "2026-11-10")).toBe("storm");
  });

  test("gives nothing for a day the forecast doesn't cover", () => {
    expect(forecastWeather(forecast, "2026-11-08")).toBeUndefined();
  });

  test("gives nothing for a day without an icon", () => {
    expect(
      forecastWeather([day("2026-11-09", null)], "2026-11-09"),
    ).toBeUndefined();
  });
});
