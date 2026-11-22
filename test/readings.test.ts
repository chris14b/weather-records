import { describe, expect, test } from "vitest";
import { locations, type Location } from "../src/shared/locations.ts";
import {
  parseRainSinceMidnight,
  parseReadings,
  readingsKeptFrom,
} from "../src/pipeline/readings.ts";
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
  test("gives the temperature and humidity of every 9am and 3pm reading in the real file", () => {
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
      temp3pm: 23.9,
      relHum3pm: 22,
      station: "066214",
    });
    expect(days[0]).toMatchObject({ temp9am: null, temp3pm: 22.5 });
    expect(days[3]).toMatchObject({ temp9am: 20.1, temp3pm: null });
  });

  test("ignores the feed's other fields, whatever they hold", () => {
    const [day] = parseRows([
      { local: "20261030090000", air_temp: 21.9, rel_hum: 53, wind_dir: "VRB" },
    ]);

    expect(day).toEqual({
      date: "2026-10-30",
      temp9am: 21.9,
      relHum9am: 53,
      temp3pm: null,
      relHum3pm: null,
      station: "066214",
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

  test("keeps a reading's missing values missing", () => {
    const [day] = parseRows([{ local: "20261030090000", air_temp: 20.1 }]);

    expect(day).toMatchObject({ temp9am: 20.1, relHum9am: null });
  });

  test("accepts the same reading twice", () => {
    const reading = { local: "20261030090000", air_temp: 20.1, rel_hum: 62 };

    expect(parseRows([reading, reading])).toHaveLength(1);
  });

  test("fails on two different readings at the same time", () => {
    expect(() =>
      parseRows([
        { local: "20261030090000", air_temp: 20.1, rel_hum: 62 },
        { local: "20261030090000", air_temp: 20.1, rel_hum: 63 },
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
      problem: "a field is missing",
      json: readingsJson("94768", stationName, [
        { local: "20261030090000" },
      ]).replace(',"rel_hum":null', ""),
      error: "expected a rel_hum field",
    },
  ])("fails when $problem", ({ json, error }) => {
    expect(() =>
      parseReadings(readingsArchive({ [fileName]: json }), observatoryHill),
    ).toThrow(error);
  });
});

const sinceMidnight = (rows: readonly Row[], today = "2026-11-21") =>
  parseRainSinceMidnight(
    readingsArchive({ [fileName]: readingsJson("94768", stationName, rows) }),
    observatoryHill,
    today,
  );

const trace = (local: string, rain_trace: string | null): Row => ({
  local,
  rain_trace,
});

describe("parseRainSinceMidnight", () => {
  test("is the latest trace less the midnight one before 9am, when both are since yesterday's 9am", () => {
    expect(
      sinceMidnight([
        trace("20261121000000", "2.8"),
        trace("20261121063000", "3.4"),
      ]),
    ).toBe(0.6);
  });

  test("adds the rain since 9am to the rain from midnight to 9am once it has reset", () => {
    expect(
      sinceMidnight([
        trace("20261121000000", "2.0"),
        trace("20261121090000", "6.6"),
        trace("20261121093000", "0.0"),
        trace("20261121103000", "3.0"),
      ]),
    ).toBe(7.6);
  });

  test("takes the 9am reading itself as the latest, without counting it twice", () => {
    expect(
      sinceMidnight([
        trace("20261121000000", "2.8"),
        trace("20261121090000", "4.4"),
      ]),
    ).toBe(1.6);
  });

  test("counts only today's readings", () => {
    expect(
      sinceMidnight([
        trace("20261120000000", "9.0"),
        trace("20261120150000", "9.0"),
        trace("20261121000000", "2.8"),
        trace("20261121030000", "3.0"),
      ]),
    ).toBe(0.2);
  });

  test("ignores a reading that isn't on the half hour", () => {
    expect(
      sinceMidnight([
        trace("20261121000000", "2.8"),
        trace("20261121063000", "3.4"),
        trace("20261121064100", "5.0"),
      ]),
    ).toBe(0.6);
  });

  test("gives none for a day with no readings yet", () => {
    expect(sinceMidnight([trace("20261120000000", "1.0")])).toBeNull();
  });

  test.each([
    {
      reading: "the midnight one",
      rows: [trace("20261121000000", "-"), trace("20261121063000", "3.4")],
    },
    {
      reading: "the latest",
      rows: [trace("20261121000000", "2.8"), trace("20261121063000", null)],
    },
    {
      reading: "the midnight one, with nothing else today",
      rows: [trace("20261121063000", "3.4")],
    },
    {
      reading: "the 9am one, after 9am",
      rows: [trace("20261121000000", "2.0"), trace("20261121103000", "3.0")],
    },
  ])("gives none when $reading is missing", ({ rows }) => {
    expect(sinceMidnight(rows)).toBeNull();
  });

  test("reads a trace given as a number", () => {
    expect(
      sinceMidnight([
        { local: "20261121000000", rain_trace: 2.8 },
        { local: "20261121063000", rain_trace: 3.4 },
      ]),
    ).toBe(0.6);
  });

  test("fails on a trace that isn't a number", () => {
    expect(() =>
      sinceMidnight([
        trace("20261121000000", "Tr"),
        trace("20261121063000", "3.4"),
      ]),
    ).toThrow('invalid rain_trace "Tr"');
  });

  test("reads the real file", () => {
    const archive = readingsArchive({ [fileName]: fixture(fileName) });

    expect(parseRainSinceMidnight(archive, observatoryHill, "2026-10-30")).toBe(
      0,
    );
  });
});

describe("readingsKeptFrom", () => {
  test.each([
    ["2026-11-06", "2025-11-01"],
    ["2027-01-31", "2026-01-01"],
  ])("keeps the readings saved on %s from %s", (today, from) => {
    expect(readingsKeptFrom(today)).toBe(from);
  });
});
