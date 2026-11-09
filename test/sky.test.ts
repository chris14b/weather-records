import { describe, expect, test } from "vitest";
import type { DayForecast } from "../src/shared/facts.ts";
import { locationById } from "../src/shared/locations.ts";
import { sunPosition, sunTimes } from "../src/shared/sun.ts";
import { forecastWeather, skyStyle } from "../src/site/sky.ts";

const morning = -100;
const evening = 100;

const glowAt = (style: Record<string, string>) => {
  const match =
    /circle at ([\d.]+)% ([\d.]+)%, rgb\(\d+ \d+ \d+ \/ ([\d.]+)\)/.exec(
      style["--glow"] ?? "",
    );
  if (match === null) throw new Error(`No glow in ${String(style["--glow"])}`);
  const [, x = NaN, y = NaN, alpha = NaN] = match.map(Number);
  return { x, y, alpha };
};

describe("skyStyle", () => {
  test("draws deep night with stars and no glow", () => {
    const night = skyStyle({ elevation: -40, hourAngle: 180 });

    expect(night["--stars"]).toBe("0.8");
    expect(night["--daylight"]).toBe("0");
    expect(glowAt(night).alpha).toBe(0);
    expect(night["--sky"]).toBe(
      "linear-gradient(180deg, rgb(11 16 38 / 1) 0%, rgb(27 37 80 / 1) 50%, rgb(45 58 110 / 1) 100%)",
    );
  });

  test("draws midday without stars", () => {
    const midday = skyStyle({ elevation: 75, hourAngle: 0 });

    expect(midday["--stars"]).toBe("0");
    expect(midday["--daylight"]).toBe("1");
  });

  test("blends between the sky's points by the sun's height", () => {
    const below = skyStyle({ elevation: 0, hourAngle: morning });
    const between = skyStyle({ elevation: 3, hourAngle: morning });
    const above = skyStyle({ elevation: 6, hourAngle: morning });
    const daylight = (style: Record<string, string>) =>
      Number(style["--daylight"]);

    expect(daylight(between)).toBeCloseTo(
      (daylight(below) + daylight(above)) / 2,
      1,
    );
  });

  test("puts the glow on the right in the morning and the left in the evening", () => {
    expect(
      glowAt(skyStyle({ elevation: 2, hourAngle: morning })).x,
    ).toBeGreaterThan(80);
    expect(
      glowAt(skyStyle({ elevation: 2, hourAngle: evening })).x,
    ).toBeLessThan(20);
  });

  test("keeps twilight's glow on the horizon", () => {
    expect(glowAt(skyStyle({ elevation: -5, hourAngle: evening })).y).toBe(100);
  });

  describe.each([
    ["summer", "2026-12-21"],
    ["winter", "2026-06-21"],
  ])("through a %s day", (_, date) => {
    const place = locationById("sydney-observatory-hill");
    const times = sunTimes(date, place);
    if (times === undefined) throw new Error(`No sunrise on ${date}`);
    const noon = new Date(
      (times.sunrise.getTime() + times.sunset.getTime()) / 2,
    );
    const glowFor = (instant: Date) =>
      glowAt(skyStyle(sunPosition(instant, place)));
    const hours = Array.from(
      { length: 13 },
      (_, index) =>
        new Date(
          times.sunrise.getTime() +
            ((times.sunset.getTime() - times.sunrise.getTime()) * index) / 12,
        ),
    );

    test("crosses the page from right to left", () => {
      const xs = hours.map((instant) => glowFor(instant).x);

      expect(xs).toEqual(xs.toSorted((a, b) => b - a));
      expect(glowFor(noon).x).toBeCloseTo(50, 0);
    });

    test("rises to noon and sets again, in an arc", () => {
      const ys = hours.map((instant) => glowFor(instant).y);

      expect(Math.min(...ys)).toBe(glowFor(noon).y);
      expect(ys.slice(0, 7)).toEqual(ys.slice(0, 7).toSorted((a, b) => b - a));
      expect(ys.slice(6)).toEqual(ys.slice(6).toSorted((a, b) => a - b));
    });
  });

  test("draws a wider, higher arc in summer than in winter", () => {
    const place = locationById("sydney-observatory-hill");
    const glowAtSunriseAndNoon = (date: string) => {
      const times = sunTimes(date, place);
      if (times === undefined) throw new Error(`No sunrise on ${date}`);
      const noon = new Date(
        (times.sunrise.getTime() + times.sunset.getTime()) / 2,
      );
      return {
        sunrise: glowAt(skyStyle(sunPosition(times.sunrise, place))),
        noon: glowAt(skyStyle(sunPosition(noon, place))),
      };
    };
    const summer = glowAtSunriseAndNoon("2026-12-21");
    const winter = glowAtSunriseAndNoon("2026-06-21");

    expect(summer.sunrise.x).toBeGreaterThan(winter.sunrise.x + 5);
    expect(summer.noon.y).toBeLessThan(15);
    expect(winter.noon.y).toBeGreaterThan(55);
  });

  test("looks the same at the same height of the sun, whatever the season", () => {
    const summer = skyStyle({ elevation: -3, hourAngle: 105 });
    const winter = skyStyle({ elevation: -3, hourAngle: 78 });

    expect(summer["--sky"]).toBe(winter["--sky"]);
    expect(summer["--sun-overcast"]).toBe(winter["--sun-overcast"]);
  });

  test("turns overcast grey, not orange, at sunset", () => {
    const sunset = skyStyle({ elevation: 0, hourAngle: evening });

    expect(sunset["--sun-overcast"]).toBe("rgb(87 82 98 / 1)");
  });
});

describe("skyStyle under the weather", () => {
  const sunset = { elevation: 0, hourAngle: evening };
  const midday = { elevation: 75, hourAngle: 0 };
  const horizon = (style: Record<string, string>) => {
    const colours = [
      ...(style["--sky"] ?? "").matchAll(/rgb\((\d+) (\d+) (\d+)/g),
    ].map(([, ...rgb]) => rgb.map(Number));
    const bottom = colours.at(-1);
    if (bottom === undefined) throw new Error("No sky colours");
    return bottom;
  };
  const warmth = (style: Record<string, string>) => {
    const [red = 0, , blue = 0] = horizon(style);
    return red - blue;
  };

  test("keeps the colours of dusk for clear and slightly cloudy days", () => {
    const clear = skyStyle(sunset, "clear");

    expect(skyStyle(sunset)).toEqual(clear);
    expect(warmth(skyStyle(sunset, "partlyCloudy"))).toBe(warmth(clear));
    expect(warmth(clear)).toBeGreaterThan(100);
  });

  test("leaves only a hint of them for a cloudy, showery or foggy day", () => {
    const clear = warmth(skyStyle(sunset, "clear"));

    for (const weather of ["cloudy", "showers", "fog"] as const) {
      expect(warmth(skyStyle(sunset, weather))).toBeCloseTo(clear / 4, -1);
    }
  });

  test("turns dusk grey in rain and storms", () => {
    for (const weather of ["rain", "storm"] as const) {
      const style = skyStyle(sunset, weather);
      const [red, green, blue] = horizon(style);

      expect(red).toBe(green);
      expect(green).toBe(blue);
      expect(style["--sun-cloud"]).toMatch(/^rgb\((\d+) \1 \1 /);
    }
  });

  test("keeps the midday blue whatever the weather", () => {
    expect(skyStyle(midday, "storm")["--sky"]).toBe(
      skyStyle(midday, "clear")["--sky"],
    );
  });

  test("mutes the sun's glow under cloud", () => {
    expect(glowAt(skyStyle(midday, "storm")).alpha).toBeLessThan(
      glowAt(skyStyle(midday, "clear")).alpha / 4,
    );
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
