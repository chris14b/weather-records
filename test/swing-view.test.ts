import { describe, expect, test } from "vitest";
import type { TemperatureSwing } from "../src/shared/facts.ts";
import { swingView } from "../src/site/swing.ts";

const day: TemperatureSwing = {
  measure: "maxTemp",
  date: "2026-11-16",
  from: 17.2,
  current: 26.4,
  forecast: 29,
};

const night: TemperatureSwing = {
  measure: "minTemp",
  date: "2026-11-17",
  from: 28.6,
  current: 22.1,
  forecast: 19,
};

describe("swingView", () => {
  test("fills the day from last night's low to the high so far, with the rest to the forecast dashed", () => {
    const view = swingView(day, "2026-11-16");

    expect(view).toMatchObject({
      title: "Today's high",
      from: { text: "17.2 °C", label: "last night" },
      current: { text: "26.4 °C" },
      forecast: { text: "29 °C", passed: false },
      description:
        "Today's high: 26.4 °C so far, up from 17.2 °C last night. Forecast 29 °C.",
    });
    expect(view?.filled).toEqual({ start: 7.2, end: 73.9 });
    expect(view?.toGo).toEqual({ start: 73.9, end: 92.8 });
  });

  test("fits the bar to its values, 1 °C past each end", () => {
    const view = swingView(day, "2026-11-16");

    expect(view?.from?.at).toBe(7.2);
    expect(view?.forecast?.at).toBe(92.8);
  });

  test("widens a short swing to 6 °C about its middle", () => {
    const view = swingView(
      { ...day, from: 20, current: 21, forecast: 22 },
      "2026-11-16",
    );

    expect(view?.from?.at).toBe(33.3);
    expect(view?.forecast?.at).toBe(66.7);
  });

  test("moves the labels below the bar apart when they're close", () => {
    const view = swingView(
      { ...day, from: 20, current: 20.5, forecast: 21 },
      "2026-11-16",
    );

    expect(view?.from?.side).toBe("before");
    expect(view?.forecast?.side).toBe("after");
    expect(swingView(day, "2026-11-16")?.from?.side).toBeUndefined();
  });

  test("keeps each temperature's colour wherever the scale starts", () => {
    expect(swingView(day, "2026-11-16")?.colours).toBe(
      "linear-gradient(90deg, #5b8def -59.4%, #6cc3d5 -1.4%, #f5d06b 49.3%, #f2994a 100%, #e5533d 158%)",
    );
  });

  test("marks a forecast the day has passed, with nothing left to go", () => {
    const view = swingView({ ...day, current: 30.1 }, "2026-11-16");

    expect(view?.forecast?.passed).toBe(true);
    expect(view?.toGo).toBeUndefined();
  });

  test("falls through tonight from today's high", () => {
    expect(swingView(night, "2026-11-16")).toMatchObject({
      title: "Tonight's low",
      from: { label: "today's high" },
      forecast: { passed: false },
      description:
        "Tonight's low: 22.1 °C so far, down from today's high of 28.6 °C. Forecast 19 °C.",
    });
  });

  test("names the night under way by its day of the week after midnight", () => {
    expect(swingView(night, "2026-11-17")).toMatchObject({
      title: "Monday night's low",
      from: { label: "Monday's high" },
    });
  });

  test("dashes the whole way to the forecast before anything is read", () => {
    const view = swingView({ ...night, current: null }, "2026-11-16");

    expect(view?.current).toBeUndefined();
    expect(view?.filled).toBeUndefined();
    expect(view?.description).toBe(
      "Tonight's low: Today's high of 28.6 °C. Forecast 19 °C.",
    );
    expect(view?.toGo).toEqual({
      start: view?.forecast?.at,
      end: view?.from?.at,
    });
  });

  test("shows nothing once the swing is out of date, or when nothing is known", () => {
    expect(swingView(day, "2026-11-17")).toBeUndefined();
    expect(swingView(night, "2026-11-18")).toBeUndefined();
    expect(
      swingView(
        { ...day, from: null, current: null, forecast: null },
        "2026-11-16",
      ),
    ).toBeUndefined();
  });
});
