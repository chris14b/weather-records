import { describe, expect, test } from "vitest";
import { locations, type Location } from "../src/shared/locations.ts";
import { parseForecast } from "../src/pipeline/forecast.ts";
import { fixture } from "./live-feeds.ts";

const [observatoryHill, airport] = locations as [Location, Location];

const parse = (xml: string, location = observatoryHill) =>
  parseForecast(Buffer.from(xml), location.forecastArea);

/** The fixture with its first match of `from` in the Sydney area replaced. */
function editSydney(from: string, to: string): string {
  const xml = fixture("IDN11060.xml");
  const area = xml.indexOf('aac="NSW_PT131"');
  return xml.slice(0, area) + xml.slice(area).replace(from, to);
}

describe("parseForecast", () => {
  test("gives each day of an area's forecast", () => {
    const forecast = parse(fixture("IDN11060.xml"), airport);

    expect(forecast.issuedAt).toBe("2026-10-29T22:45:46Z");
    expect(forecast.days).toHaveLength(7);
    expect(forecast.days.slice(0, 2)).toEqual([
      {
        date: "2026-10-30",
        minTemp: null,
        maxTemp: 24,
        rainChance: 0,
        rain50: null,
        rain25: null,
      },
      {
        date: "2026-10-31",
        minTemp: 17,
        maxTemp: 28,
        rainChance: 80,
        rain50: 0,
        rain25: 8,
      },
    ]);
    expect(forecast.days.at(-1)?.date).toBe("2026-11-05");
  });

  test("reads the rain amount with a 50% chance from the low end of the range", () => {
    const xml = editSydney(
      'precipitation_range">0 to 8 mm',
      'precipitation_range">1 to 15 mm',
    );

    expect(parse(xml).days[1]).toMatchObject({ rain50: 1, rain25: 15 });
  });

  test.each([
    {
      problem: "the area is missing",
      xml: () => editSydney('aac="NSW_PT131"', 'aac="NSW_PT999"'),
      error: "expected one area NSW_PT131, found 0",
    },
    {
      problem: "the area's description has changed",
      xml: () =>
        editSydney('description="Sydney"', 'description="Sydney City"'),
      error: "expected the description Sydney, found Sydney City",
    },
    {
      problem: "the rain range has a new format",
      xml: () =>
        editSydney(
          'precipitation_range">0 to 8 mm',
          'precipitation_range">8 mm',
        ),
      error: "forecast period 1: invalid rain range 8 mm",
    },
    {
      problem: "the chance of rain has a new format",
      xml: () => editSydney(">80%<", ">80 percent<"),
      error: "invalid chance of rain 80 percent",
    },
    {
      problem: "a temperature isn't a whole number",
      xml: () => editSydney('Celsius">28<', 'Celsius">28.5<'),
      error: "invalid air_temperature_maximum 28.5",
    },
    {
      problem: "a day is skipped",
      xml: () =>
        editSydney(
          'index="2" start-time-local="2026-11-01T00:00:00+11:00" end-time-local="2026-11-02T00:00:00+11:00"',
          'index="2" start-time-local="2026-11-02T00:00:00+11:00" end-time-local="2026-11-03T00:00:00+11:00"',
        ),
      error: "forecast period 2: expected 2026-11-01, found 2026-11-02",
    },
    {
      problem: "a period doesn't end at midnight",
      xml: () =>
        editSydney(
          'end-time-local="2026-11-01T00:00:00+11:00"',
          'end-time-local="2026-11-01T06:00:00+11:00"',
        ),
      error: "expected the period to end at midnight",
    },
  ])("fails when $problem", ({ xml, error }) => {
    expect(() => parse(xml())).toThrow(error);
  });
});
