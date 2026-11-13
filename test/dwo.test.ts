import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  currentStation,
  locationById,
  type Station,
} from "../src/shared/locations.ts";
import {
  addDwoReadings,
  downloadPage,
  dwoFileMonth,
  dwoUrl,
  missingDwoDays,
  parseDwo,
} from "../src/pipeline/dwo.ts";
import { type DailyReadings, parseReadings } from "../src/pipeline/readings.ts";
import { fixture, readingsArchive } from "./live-feeds.ts";

const observatoryHill = currentStation(locationById("sydney-observatory-hill"));
const airport = currentStation(locationById("sydney-airport"));

const header =
  ',"Date","Minimum temperature (°C)","Maximum temperature (°C)","Rainfall (mm)","Evaporation (mm)","Sunshine (hours)","Direction of maximum wind gust ","Speed of maximum wind gust (km/h)","Time of maximum wind gust","9am Temperature (°C)","9am relative humidity (%)","9am cloud amount (oktas)","9am wind direction","9am wind speed (km/h)","9am MSL pressure (hPa)","3pm Temperature (°C)","3pm relative humidity (%)","3pm cloud amount (oktas)","3pm wind direction","3pm wind speed (km/h)","3pm MSL pressure (hPa)"';

const sydneySources = [
  '"Most observations from Observatory Hill, but some from Fort Denison and Sydney Airport."',
  '"Sydney Airport is about 10 km to the south of Observatory Hill."',
  '"Temperature, humidity and rainfall observations are from Sydney (Observatory Hill) {station 066214}"',
  '"Pressure, cloud, evaporation and sunshine observations are from Sydney Airport AMO {station 066037}"',
  '"Wind observations are from Fort Denison {station 066022}"',
].join("\r\n");

type Readings = [
  temp9am: string,
  relHum9am: string,
  temp3pm: string,
  relHum3pm: string,
  gust?: string,
];

/** A DWO CSV laid out as BOM's are, as Latin-1 bytes, with a row per day from the 1st. */
function dwoCsv(
  month: string,
  days: readonly Readings[],
  sources = sydneySources,
  columns = header,
): Uint8Array {
  const rows = days.map(
    ([temp9am, relHum9am, temp3pm, relHum3pm, gust = "39"], index) =>
      `,${month}-${String(index + 1)},15.2,24.1,0,,,SE,${gust},13:21,${temp9am},${relHum9am},7,ESE,15,1016.1,${temp3pm},${relHum3pm},7,ESE,20,1015.0`,
  );
  const text = [
    '"Daily Weather Observations for Sydney, New South Wales for November 2026"',
    '"Prepared at 13:00 UTC on Thursday 12 November 2026   IDCJDW2124.202611"',
    '"Copyright 2003 Commonwealth Bureau of Meteorology"',
    sources,
    "",
    columns,
    ...rows,
  ].join("\r\n");
  return Uint8Array.from(text, (char) => char.charCodeAt(0));
}

const parse = (
  bytes: Uint8Array,
  fileName = "IDCJDW2124.202611.csv",
  station: Station = observatoryHill,
) => parseDwo(bytes, fileName, station);

describe("parseDwo", () => {
  const realFile = "IDCJDW2124.202610.csv";
  const real = () =>
    parse(
      readFileSync(join(import.meta.dirname, "fixtures", realFile)),
      realFile,
    );

  test("reads every day of a real file", () => {
    const days = real();

    expect(days).toHaveLength(31);
    expect(days[27]).toEqual({
      date: "2026-10-28",
      temp9am: 18.1,
      relHum9am: 42,
      temp3pm: 23.9,
      relHum3pm: 22,
      gust: null,
    });
  });

  test("agrees with the live feed's readings on the days both have", () => {
    const feed = parseReadings(
      readingsArchive({
        "IDN60910.94768.json": fixture("IDN60910.94768.json"),
      }),
      locationById("sydney-observatory-hill"),
    );

    expect(() => addDwoReadings(feed, real(), "2025-10-01")).not.toThrow();
  });

  test("gives each day's 9am and 3pm temperature and humidity", () => {
    const days = parse(
      dwoCsv("2026-11", [
        ["18.1", "42", "23.9", "22"],
        ["", "", "21.4", "60"],
      ]),
    );

    expect(days).toEqual([
      {
        date: "2026-11-01",
        temp9am: 18.1,
        relHum9am: 42,
        temp3pm: 23.9,
        relHum3pm: 22,
        gust: null,
      },
      {
        date: "2026-11-02",
        temp9am: null,
        relHum9am: null,
        temp3pm: 21.4,
        relHum3pm: 60,
        gust: null,
      },
    ]);
  });

  test("has no gusts for Observatory Hill, whose file takes its wind from Fort Denison", () => {
    expect(real().every(({ gust }) => gust === null)).toBe(true);
  });

  test("gives each day's strongest gust for a station that measures wind, blank when missing", () => {
    const days = parse(
      dwoCsv(
        "2026-10",
        [
          ["16", "70", "19.5", "64", "67"],
          ["17", "72", "20.1", "60", ""],
        ],
        '"Observations were drawn from Sydney Airport AMO {station 066037}"',
      ),
      "IDCJDW2125.202610.csv",
      airport,
    );

    expect(days.map(({ gust }) => gust)).toEqual([67, null]);
  });

  test("fails when a station that measures wind has its wind from another station", () => {
    const sources = [
      '"Temperature and humidity observations are from Sydney Airport AMO {station 066037}"',
      '"Wind observations are from Fort Denison {station 066022}"',
    ].join("\r\n");

    expect(() =>
      parse(dwoCsv("2026-10", [], sources), "IDCJDW2125.202610.csv", airport),
    ).toThrow("expected the wind from station 066037, found 066022");
  });

  test("accepts a file that takes all its observations from the station", () => {
    const days = parse(
      dwoCsv(
        "2026-10",
        [["16", "70", "19.5", "64"]],
        '"Observations were drawn from Sydney Airport AMO {station 066037}"',
      ),
      "IDCJDW2125.202610.csv",
      airport,
    );

    expect(days).toEqual([expect.objectContaining({ date: "2026-10-01" })]);
  });

  test.each([
    {
      problem: "the file is for another station's product",
      fileName: "IDCJDW2125.202611.csv",
      bytes: dwoCsv("2026-11", []),
      error: "expected IDCJDW2124 for station 066214, found IDCJDW2125",
    },
    {
      problem: "the file isn't named like a DWO CSV",
      fileName: "IDCJDW2124.csv",
      bytes: dwoCsv("2026-11", []),
      error: "expected a name like IDCJDW2124.202611.csv",
    },
    {
      problem: "the temperature is from another station",
      bytes: dwoCsv(
        "2026-11",
        [],
        '"Observations were drawn from Sydney Airport AMO {station 066037}"',
      ),
      error: "expected station 066214, found 066037",
    },
    {
      problem: "the humidity is from another station",
      bytes: dwoCsv(
        "2026-11",
        [],
        '"Temperature observations are from Sydney (Observatory Hill) {station 066214}, humidity observations are from Sydney Airport {station 066037}."',
      ),
      error: "expected the humidity from station 066214, found 066037",
    },
    {
      problem: "it can't tell which station has the temperature",
      bytes: dwoCsv(
        "2026-11",
        [],
        '"Observations are from Sydney (Observatory Hill) {station 066214} and Fort Denison {station 066022}."',
      ),
      error: "but not which one has the temperature",
    },
    {
      problem: "no station is named",
      bytes: dwoCsv("2026-11", [], '"Observations are from Sydney"'),
      error: "names no station",
    },
    {
      problem: "a column has gone",
      bytes: dwoCsv(
        "2026-11",
        [],
        sydneySources,
        header.replace('"3pm relative humidity (%)"', '"3pm humidity (%)"'),
      ),
      error: 'expected one "3pm relative humidity" column, found 0',
    },
    {
      problem: "there are no column headers",
      bytes: dwoCsv("2026-11", [], sydneySources, ""),
      error: "found no column headers",
    },
  ])("fails when $problem", ({ fileName, bytes, error }) => {
    expect(() => parse(bytes, fileName)).toThrow(error);
  });

  test("fails on a day out of order", () => {
    const bytes = dwoCsv("2026-11", [
      ["18.1", "42", "23.9", "22"],
      ["18.1", "42", "23.9", "22"],
    ]);
    const skipped = new TextDecoder("latin1")
      .decode(bytes)
      .replace(",2026-11-2,", ",2026-11-3,");

    expect(() =>
      parse(Uint8Array.from(skipped, (char) => char.charCodeAt(0))),
    ).toThrow("line 12: expected 2026-11-02, found 2026-11-03");
  });

  test("fails on a value that isn't a number", () => {
    expect(() => parse(dwoCsv("2026-11", [["18.1", "42", "?", "22"]]))).toThrow(
      'line 11: invalid value "?"',
    );
  });

  test("fails on a day from another month", () => {
    expect(() =>
      parse(dwoCsv("2026-10", [["18.1", "42", "23.9", "22"]])),
    ).toThrow("expected 2026-11-01, found 2026-10-01");
  });
});

describe("dwoFileMonth", () => {
  test("reads the product and month from the file's name", () => {
    expect(dwoFileMonth("IDCJDW2061.202512.csv")).toEqual({
      product: "IDCJDW2061",
      month: "2025-12",
    });
  });

  test("ignores any other file", () => {
    expect(dwoFileMonth("IDCJDW2061.202512.pdf")).toBeUndefined();
  });
});

test("dwoUrl gives the month's CSV on BOM's website", () => {
  expect(dwoUrl("IDCJDW2124", "2025-12")).toBe(
    "https://www.bom.gov.au/climate/dwo/202512/text/IDCJDW2124.202512.csv",
  );
});

const day = (
  date: string,
  values: Partial<Omit<DailyReadings, "date">> = {},
): DailyReadings => ({
  date,
  temp9am: 18.1,
  relHum9am: 42,
  temp3pm: 23.9,
  relHum3pm: 22,
  ...values,
});

describe("addDwoReadings", () => {
  test("fills the days before saving began", () => {
    const merged = addDwoReadings(
      [day("2026-11-06")],
      [day("2026-11-04"), day("2026-11-05")],
      "2025-11-01",
    );

    expect(merged.map(({ date }) => date)).toEqual([
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
    ]);
  });

  test("fills a gap that missed runs left, value by value", () => {
    const merged = addDwoReadings(
      [day("2026-11-06", { temp9am: null, relHum9am: null })],
      [day("2026-11-06", { temp9am: 20.1, relHum9am: 72 })],
      "2025-11-01",
    );

    expect(merged).toEqual([
      day("2026-11-06", { temp9am: 20.1, relHum9am: 72 }),
    ]);
  });

  test("keeps a saved value the DWO leaves blank", () => {
    const merged = addDwoReadings(
      [day("2026-11-06")],
      [day("2026-11-06", { temp3pm: null })],
      "2025-11-01",
    );

    expect(merged).toEqual([day("2026-11-06")]);
  });

  test("fails, listing each one, where the two disagree", () => {
    expect(() =>
      addDwoReadings(
        [day("2026-11-06"), day("2026-11-07")],
        [
          day("2026-11-06", { temp9am: 18.2 }),
          day("2026-11-07", { relHum3pm: 24 }),
        ],
        "2025-11-01",
      ),
    ).toThrow(
      "2026-11-06 temp9am: saved 18.1, DWO 18.2\n  2026-11-07 relHum3pm: saved 22, DWO 24",
    );
  });

  test("keeps the saved humidity where the DWO's is 1% from it", () => {
    const merged = addDwoReadings(
      [day("2026-11-12", { relHum3pm: 52 })],
      [day("2026-11-12", { relHum3pm: 53 })],
      "2025-11-01",
    );

    expect(merged).toEqual([day("2026-11-12", { relHum3pm: 52 })]);
  });

  test("keeps nothing from before the readings are kept from", () => {
    const merged = addDwoReadings(
      [day("2025-10-31")],
      [day("2025-10-30"), day("2025-11-01")],
      "2025-11-01",
    );

    expect(merged).toEqual([day("2025-11-01")]);
  });
});

describe("missingDwoDays", () => {
  test("lists each month's days with no readings or a blank one", () => {
    const missing = missingDwoDays(
      [
        day("2026-10-30"),
        day("2026-11-01", { relHum3pm: null }),
        day("2026-11-02"),
      ],
      undefined,
      "2026-10-29",
      "2026-11-03",
    );

    expect(missing).toEqual(
      new Map([
        ["2026-10", ["2026-10-29", "2026-10-31"]],
        ["2026-11", ["2026-11-01", "2026-11-03"]],
      ]),
    );
  });

  test("lists a day with only the runs' gust, since that is only the strongest so far", () => {
    const missing = missingDwoDays(
      [day("2026-11-01"), day("2026-11-02"), day("2026-11-03")],
      [
        { date: "2026-11-01", feedGust: 52, dwoGust: 57 },
        { date: "2026-11-02", feedGust: 40, dwoGust: null },
      ],
      "2026-11-01",
      "2026-11-03",
    );

    expect(missing).toEqual(
      new Map([["2026-11", ["2026-11-02", "2026-11-03"]]]),
    );
  });

  test("lists nothing when every day has its readings", () => {
    expect(
      missingDwoDays(
        [day("2026-11-01")],
        undefined,
        "2026-11-01",
        "2026-11-01",
      ),
    ).toEqual(new Map());
  });
});

describe("downloadPage", () => {
  const page = downloadPage([
    {
      name: "Sydney - Observatory Hill",
      links: [
        {
          month: "2025-11",
          url: dwoUrl("IDCJDW2124", "2025-11"),
          missingDays: 30,
          downloaded: false,
        },
        {
          month: "2026-11",
          url: dwoUrl("IDCJDW2124", "2026-11"),
          missingDays: 1,
          downloaded: true,
        },
      ],
    },
    { name: "Sydney Airport", links: [] },
  ]);

  test("links each month still missing a reading", () => {
    expect(page).toContain(
      '<li><a href="https://www.bom.gov.au/climate/dwo/202511/text/IDCJDW2124.202511.csv">November 2025</a> (30 days missing)</li>',
    );
  });

  test("says when a month's file is already downloaded", () => {
    expect(page).toContain(
      "November 2026</a> (1 day missing, already downloaded)</li>",
    );
  });

  test("says when a location is missing nothing", () => {
    expect(page).toContain(
      "<h2>Sydney Airport</h2>\n<ul>\n<li>Nothing missing.</li>",
    );
  });
});
