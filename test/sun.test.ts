import { describe, expect, test } from "vitest";
import { locationById } from "../src/shared/locations.ts";
import { sunPosition, sunTimes } from "../src/shared/sun.ts";

const sydneyTime = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const toMinute = (instant: Date) =>
  sydneyTime.format(new Date(Math.round(instant.getTime() / 60_000) * 60_000));

// Published by the US Naval Observatory (aa.usno.navy.mil/data/RS_OneDay) for each
// location's coordinates, in Sydney's clock time.
describe("sunTimes", () => {
  test.each([
    ["sydney-observatory-hill", "2026-03-21", "06:59", "19:06"],
    ["sydney-observatory-hill", "2026-06-21", "07:00", "16:54"],
    ["sydney-observatory-hill", "2026-09-22", "05:45", "17:51"],
    ["sydney-observatory-hill", "2026-12-21", "05:41", "20:05"],
    ["sydney-observatory-hill", "2027-01-08", "05:53", "20:10"],
    ["sydney-airport", "2026-03-21", "06:59", "19:06"],
    ["sydney-airport", "2026-06-21", "07:00", "16:54"],
    ["sydney-airport", "2026-09-22", "05:46", "17:51"],
    ["sydney-airport", "2026-12-21", "05:41", "20:06"],
    ["sydney-airport", "2027-01-08", "05:53", "20:10"],
    ["sydney-olympic-park", "2026-03-21", "06:59", "19:06"],
    ["sydney-olympic-park", "2026-06-21", "07:00", "16:54"],
    ["sydney-olympic-park", "2026-09-22", "05:46", "17:52"],
    ["sydney-olympic-park", "2026-12-21", "05:41", "20:06"],
    ["sydney-olympic-park", "2027-01-08", "05:54", "20:10"],
  ])("matches the published times at %s on %s", (id, date, sunrise, sunset) => {
    const times = sunTimes(date, locationById(id));

    expect(times && toMinute(times.sunrise)).toBe(sunrise);
    expect(times && toMinute(times.sunset)).toBe(sunset);
  });

  test("gives nothing when the sun doesn't set", () => {
    expect(
      sunTimes("2026-06-21", { latitude: 78.2, longitude: 15.6 }),
    ).toBeUndefined();
  });
});

describe("sunPosition", () => {
  const observatoryHill = locationById("sydney-observatory-hill");

  test("puts the sun just below the horizon at sunrise, south of east in summer", () => {
    const times = sunTimes("2026-12-21", observatoryHill);
    if (times === undefined) throw new Error("No sunrise");
    const { elevation, azimuth, hourAngle } = sunPosition(
      times.sunrise,
      observatoryHill,
    );

    expect(elevation).toBeCloseTo(-0.833, 1);
    expect(hourAngle).toBeCloseTo(-108, 0);
    expect(azimuth).toBeGreaterThan(110);
    expect(azimuth).toBeLessThan(125);
  });

  test("puts the sun high in the north at midsummer noon", () => {
    const { elevation, azimuth, hourAngle } = sunPosition(
      new Date("2026-12-21T01:53:00Z"),
      observatoryHill,
    );

    expect(Math.abs(hourAngle)).toBeLessThan(1);

    expect(elevation).toBeCloseTo(90 - 33.86 + 23.44, 0);
    expect(Math.min(azimuth, 360 - azimuth)).toBeLessThan(2);
  });

  test("puts the sun in the west in the evening", () => {
    const { elevation, azimuth } = sunPosition(
      new Date("2026-06-21T07:30:00Z"),
      observatoryHill,
    );

    expect(elevation).toBeLessThan(0);
    expect(azimuth).toBeGreaterThan(240);
    expect(azimuth).toBeLessThan(300);
  });
});
