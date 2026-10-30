import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { locations } from "../src/shared/locations.ts";
import {
  dailyFilePath,
  folderMonths,
  parseDailyFile,
} from "../src/pipeline/daily-files.ts";
import { dailyFile, daysFrom, humidityAndSolarFrom } from "./daily-file.ts";

function stationByNumber(number: string) {
  const station = locations
    .flatMap((l) => l.stations)
    .find((s) => s.station === number);
  if (station === undefined) throw new Error(`No station ${number}`);
  return station;
}

const observatoryHill = {
  station: stationByNumber("066214"),
  month: "2026-10",
};

async function readFixture(): Promise<string> {
  const bytes = await readFile(
    join(
      import.meta.dirname,
      "fixtures",
      "sydney_(observatory_hill)-202610.csv",
    ),
  );
  return bytes.toString("latin1");
}

function parseText(text: string) {
  return parseDailyFile(Buffer.from(text, "latin1"), observatoryHill);
}

describe("dailyFilePath", () => {
  test("points at the station's monthly file", () => {
    expect(dailyFilePath(observatoryHill)).toBe(
      "/anon/gen/clim_data/IDCKWCDEA0/tables/nsw/sydney_(observatory_hill)/sydney_(observatory_hill)-202610.csv",
    );
  });
});

describe("folderMonths", () => {
  test("leaves out months before the folder's first file and the months it has none for", () => {
    const folder = {
      name: "test",
      from: "2018-02",
      missing: [{ from: "2018-04", to: "2018-05" }],
    };

    expect(folderMonths(folder, "2017-11", "2018-07")).toEqual([
      "2018-02",
      "2018-03",
      "2018-06",
      "2018-07",
    ]);
  });
});

describe("parseDailyFile with a real file", () => {
  test("reads every day of the month so far", async () => {
    const days = parseText(await readFixture());

    expect(days).toHaveLength(28);
    expect(days[0]).toEqual({
      date: "2026-10-01",
      rain: 0,
      maxTemp: 30.1,
      minTemp: 14.6,
      maxRelHum: 79,
      minRelHum: 18,
      solar: 21.89,
    });
    expect(days.at(-1)?.date).toBe("2026-10-28");
  });

  test("treats blank cells as missing", async () => {
    const days = parseText(await readFixture());

    expect(
      days.filter((d) => d.date >= "2026-10-14" && d.date <= "2026-10-15"),
    ).toEqual([
      {
        date: "2026-10-14",
        rain: 83.4,
        maxTemp: null,
        minTemp: 13.2,
        maxRelHum: 94,
        minRelHum: 46,
        solar: 17.17,
      },
      {
        date: "2026-10-15",
        rain: null,
        maxTemp: 17.6,
        minTemp: null,
        maxRelHum: 95,
        minRelHum: 59,
        solar: 12.63,
      },
    ]);
  });

  test("fails when the column headers have changed", async () => {
    const text = (await readFixture()).replace(
      "0900-0900,0900-0900",
      "0900-0900,0000-2400",
    );

    expect(() => parseText(text)).toThrow("line 12: unexpected column headers");
  });

  test("fails when the file is for another station", async () => {
    const text = (await readFixture()).replaceAll(
      "SYDNEY (OBSERVATORY HILL)",
      "SYDNEY AIRPORT AMO",
    );

    expect(() => parseText(text)).toThrow(
      'expected the title "Daily Evapotranspiration for SYDNEY (OBSERVATORY HILL) New South Wales for October 2026"',
    );
  });

  test("fails when the file is for another month", () => {
    const file = dailyFile(
      "SYDNEY (OBSERVATORY HILL)",
      daysFrom("2026-09-01", [0, 20, 10]),
    );

    expect(() => parseDailyFile(file, observatoryHill)).toThrow(
      "for September 2026",
    );
  });

  test("fails when a row names another station", async () => {
    const text = (await readFixture()).replace(
      "SYDNEY (OBSERVATORY HILL),02/10/2026",
      "SYDNEY AIRPORT AMO,02/10/2026",
    );

    expect(() => parseText(text)).toThrow(
      "line 15: station SYDNEY AIRPORT AMO does not match SYDNEY (OBSERVATORY HILL)",
    );
  });

  test("fails when a day is left out", async () => {
    const text = (await readFixture()).replace(
      /^SYDNEY \(OBSERVATORY HILL\),05\/10\/2026.*\n/m,
      "",
    );

    expect(() => parseText(text)).toThrow(
      "line 18: expected 2026-10-05, found 06/10/2026",
    );
  });

  test("fails on a value that isn't a number", async () => {
    const text = (await readFixture()).replace(
      "02/10/2026,2.7,0.0",
      "02/10/2026,2.7,trace",
    );

    expect(() => parseText(text)).toThrow("line 15: invalid value trace");
  });

  test("fails on a row with the wrong number of columns", async () => {
    const text = (await readFixture()).replace(
      "02/10/2026,2.7,",
      "02/10/2026,",
    );

    expect(() => parseText(text)).toThrow(
      "line 15: expected 11 columns, found 10",
    );
  });

  test("fails when the file is cut short", async () => {
    const text = (await readFixture()).replace(/^Totals:.*$/m, "");

    expect(() => parseText(text)).toThrow("ends without a Totals line");
  });
});

describe("parseDailyFile with a made-up file", () => {
  const airport = stationByNumber("066037");

  test("keeps a day with no values as a day of missing values", () => {
    const file = dailyFile(
      "SYDNEY AIRPORT AMO",
      daysFrom("2026-02-01", [null, null, null], [0, 9.9, -1.5]),
    );

    expect(
      parseDailyFile(file, { station: airport, month: "2026-02" }),
    ).toEqual([
      {
        date: "2026-02-01",
        rain: null,
        maxTemp: null,
        minTemp: null,
        maxRelHum: null,
        minRelHum: null,
        solar: null,
      },
      {
        date: "2026-02-02",
        rain: 0,
        maxTemp: 9.9,
        minTemp: -1.5,
        maxRelHum: null,
        minRelHum: null,
        solar: null,
      },
    ]);
  });

  test("treats blank humidity and solar cells as missing", () => {
    const file = dailyFile(
      "SYDNEY AIRPORT AMO",
      humidityAndSolarFrom("2026-02-01", [100, null, 8.5], [null, 41, null]),
    );

    expect(
      parseDailyFile(file, { station: airport, month: "2026-02" }).map(
        ({ date, maxRelHum, minRelHum, solar }) => ({
          date,
          maxRelHum,
          minRelHum,
          solar,
        }),
      ),
    ).toEqual(
      humidityAndSolarFrom("2026-02-01", [100, null, 8.5], [null, 41, null]),
    );
  });

  test("fails on a solar value that isn't a number", async () => {
    const text = (await readFixture()).replace("0.00,21.89", "0.00,n/a");

    expect(() => parseText(text)).toThrow("line 14: invalid value n/a");
  });

  test("accepts a month with no days yet", () => {
    const file = dailyFile("SYDNEY AIRPORT AMO", []);

    expect(
      parseDailyFile(file, { station: airport, month: "2026-10" }),
    ).toEqual([]);
  });

  test("expects an AWS station's official name without AWS", () => {
    const olympicPark = stationByNumber("066212");
    const file = dailyFile(
      "SYDNEY OLYMPIC PARK (ARCHERY CENTRE)",
      daysFrom("2026-10-01", [0, 22, 12]),
    );

    expect(
      parseDailyFile(file, { station: olympicPark, month: "2026-10" }),
    ).toHaveLength(1);
  });

  test("fails when an AWS station's file keeps AWS in the name", () => {
    const olympicPark = stationByNumber("066212");
    const file = dailyFile(
      "SYDNEY OLYMPIC PARK AWS (ARCHERY CENTRE)",
      daysFrom("2026-10-01", [0, 22, 12]),
    );

    expect(() =>
      parseDailyFile(file, { station: olympicPark, month: "2026-10" }),
    ).toThrow("expected the title");
  });
});
