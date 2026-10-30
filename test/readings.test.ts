import { describe, expect, test } from "vitest";
import { locations, type Location } from "../src/shared/locations.ts";
import { parseReadings } from "../src/pipeline/readings.ts";
import {
  fixture,
  readingsArchive,
  readingsJson,
  type Row,
} from "./live-feeds.ts";

const [observatoryHill] = locations as [Location];
const fileName = "IDN60910.94768.json";
const stationName = "Sydney - Observatory Hill";

const parseRows = (rows: readonly Row[]) =>
  parseReadings(
    readingsArchive({ [fileName]: readingsJson("94768", stationName, rows) }),
    observatoryHill,
  );

describe("parseReadings", () => {
  test("gives every field of every 9am and 3pm reading in the real file", () => {
    const archive = readingsArchive({
      "IDN60910.94767.json": "{}",
      [fileName]: fixture(fileName),
    });

    const days = parseReadings(archive, observatoryHill);

    expect(days.map(({ date }) => date)).toEqual([
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
    ]);
    expect(days[1]).toEqual({
      date: "2026-10-28",
      temp9am: 18.1,
      relHum9am: 42,
      dewPoint9am: 5,
      pressure9am: 1018.3,
      cloud9am: null,
      windDir9am: "W",
      windSpeed9am: 22,
      gust9am: null,
      temp3pm: 23.9,
      relHum3pm: 22,
      dewPoint3pm: 0.9,
      pressure3pm: 1015.3,
      cloud3pm: null,
      windDir3pm: "SW",
      windSpeed3pm: 24,
      gust3pm: null,
      station: "066214",
    });
    expect(days[0]).toMatchObject({ temp9am: null, temp3pm: 22.5 });
    expect(days[3]).toMatchObject({ temp9am: 20.1, temp3pm: null });
  });

  test("gives cloud, gust and calm where the station reports them", () => {
    const [day] = parseRows([
      {
        local: "20261030090000",
        air_temp: 21.9,
        rel_hum: 53,
        dewpt: 11.9,
        press_msl: 1025.2,
        cloud_oktas: 4,
        wind_dir: "CALM",
        wind_spd_kmh: 0,
        gust_kmh: 20,
      },
    ]);

    expect(day).toMatchObject({
      cloud9am: 4,
      windDir9am: "CALM",
      windSpeed9am: 0,
      gust9am: 20,
    });
  });

  test("never uses a reading from a nearby time", () => {
    const days = parseRows([
      { local: "20261030083000", air_temp: 19.5 },
      { local: "20261030090100", air_temp: 19.7 },
      { local: "20261030150000", air_temp: 22.2 },
    ]);

    expect(days).toEqual([
      expect.objectContaining({
        date: "2026-10-30",
        temp9am: null,
        temp3pm: 22.2,
      }),
    ]);
  });

  test("keeps a reading's missing values missing, including a wind direction of -", () => {
    const [day] = parseRows([
      { local: "20261030090000", air_temp: 20.1, wind_dir: "-" },
    ]);

    expect(day).toMatchObject({
      temp9am: 20.1,
      relHum9am: null,
      pressure9am: null,
      windDir9am: null,
    });
  });

  test("accepts the same reading twice", () => {
    const reading = { local: "20261030090000", air_temp: 20.1, wind_dir: "N" };

    expect(parseRows([reading, reading])).toHaveLength(1);
  });

  test("fails on two different readings at the same time", () => {
    expect(() =>
      parseRows([
        { local: "20261030090000", air_temp: 20.1, wind_dir: "N" },
        { local: "20261030090000", air_temp: 20.1, wind_dir: "NNE" },
      ]),
    ).toThrow("two different readings at 2026-10-30 090000");
  });

  test("fails when the station's file is missing", () => {
    const archive = readingsArchive({ "IDN60910.94767.json": "{}" });

    expect(() => parseReadings(archive, observatoryHill)).toThrow(
      "should hold one IDN60910.94768.json, found 0",
    );
  });

  test.each([
    {
      problem: "the header names another location",
      json: readingsJson("94768", "Sydney Airport", []),
      error: "expected the header's name to be Sydney - Observatory Hill",
    },
    {
      problem: "a row is from another station",
      json: readingsJson("94768", stationName, [
        { local: "20261030090000" },
      ]).replace('"wmo":94768', '"wmo":94767'),
      error: "observation 0: expected wmo 94768, found 94767",
    },
    {
      problem: "a time is badly formed",
      json: readingsJson("94768", stationName, [{ local: "2026-10-30 09:00" }]),
      error: 'invalid aifstime_local "2026-10-30 09:00"',
    },
    {
      problem: "a value isn't a number",
      json: readingsJson("94768", stationName, [
        { local: "20261030090000", air_temp: 20 },
      ]).replace('"air_temp":20', '"air_temp":"20"'),
      error: 'expected air_temp to be a number, found "20"',
    },
    {
      problem: "a wind direction isn't a compass point",
      json: readingsJson("94768", stationName, [
        { local: "20261030090000", wind_dir: "VRB" },
      ]),
      error: 'invalid wind_dir "VRB"',
    },
    {
      problem: "a field is missing",
      json: readingsJson("94768", stationName, [
        { local: "20261030090000" },
      ]).replace(',"gust_kmh":null', ""),
      error: "expected a gust_kmh field",
    },
  ])("fails when $problem", ({ json, error }) => {
    expect(() =>
      parseReadings(readingsArchive({ [fileName]: json }), observatoryHill),
    ).toThrow(error);
  });
});
