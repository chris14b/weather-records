import { describe, expect, test } from "vitest";
import { rainView } from "../src/site/rain.ts";

const rain = { date: "2026-11-16", soFar: 7.6 };

describe("rainView", () => {
  test("gives the rain since midnight with its unit", () => {
    expect(rainView(rain, "2026-11-16")).toEqual({
      title: "Today's rain",
      text: "7.6 mm",
      description: "Today's rain: 7.6 mm since midnight.",
    });
  });

  test("shows a dry day as 0.0 mm", () => {
    expect(rainView({ ...rain, soFar: 0 }, "2026-11-16")?.text).toBe("0.0 mm");
  });

  test("shows nothing when the reading is missing", () => {
    expect(rainView({ ...rain, soFar: null }, "2026-11-16")).toBeUndefined();
  });

  test("shows nothing once it is out of date", () => {
    expect(rainView(rain, "2026-11-17")).toBeUndefined();
  });
});
