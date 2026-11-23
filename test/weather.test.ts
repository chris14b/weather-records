import { describe, expect, test } from "vitest";
import { weatherForIcon, weathers } from "../src/shared/weather.ts";

const bomIconCodes = [
  1, 2, 3, 4, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
];

describe("weatherForIcon", () => {
  test.each([
    [1, "clear"],
    [2, "clear"],
    [3, "partlyCloudy"],
    [4, "cloudy"],
    [6, "haze"],
    [8, "lightRain"],
    [9, "windy"],
    [10, "fog"],
    [11, "showers"],
    [12, "rain"],
    [13, "dust"],
    [14, "frost"],
    [15, "snow"],
    [16, "storm"],
    [17, "lightShowers"],
    [18, "heavyShowers"],
    [19, "cyclone"],
  ])("maps icon code %i to %s", (code, weather) => {
    expect(weatherForIcon(code)).toBe(weather);
  });

  test.each([0, 5, 7, 20])("has no sky for the unused code %i", (code) => {
    expect(weatherForIcon(code)).toBeUndefined();
  });

  test("gives every kind of sky to a BOM code", () => {
    const used = new Set(bomIconCodes.map((code) => weatherForIcon(code)));

    expect([...used].toSorted()).toEqual([...weathers].toSorted());
  });
});
