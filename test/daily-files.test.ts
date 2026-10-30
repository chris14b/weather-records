import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { dailyFilePath, parseDailyFile } from "../src/pipeline/daily-files.ts";
import { dailyFile, daysFrom } from "./daily-file.ts";

const observatoryHill = {
  folder: "sydney_(observatory_hill)",
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
  test("points at the location's monthly file", () => {
    expect(dailyFilePath(observatoryHill)).toBe(
      "/anon/gen/clim_data/IDCKWCDEA0/tables/nsw/sydney_(observatory_hill)/sydney_(observatory_hill)-202610.csv",
    );
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
    });
    expect(days.at(-1)?.date).toBe("2026-10-28");
  });

  test("treats blank cells as missing", async () => {
    const days = parseText(await readFixture());

    expect(
      days.filter((d) => d.date >= "2026-10-14" && d.date <= "2026-10-15"),
    ).toEqual([
      { date: "2026-10-14", rain: 83.4, maxTemp: null, minTemp: 13.2 },
      { date: "2026-10-15", rain: null, maxTemp: 17.6, minTemp: null },
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
      "sydney_(observatory_hill)",
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
  test("keeps a day with no values as a day of missing values", () => {
    const file = dailyFile(
      "sydney_airport_amo",
      daysFrom("2026-02-01", [null, null, null], [0, 9.9, -1.5]),
    );

    expect(
      parseDailyFile(file, { folder: "sydney_airport_amo", month: "2026-02" }),
    ).toEqual([
      { date: "2026-02-01", rain: null, maxTemp: null, minTemp: null },
      { date: "2026-02-02", rain: 0, maxTemp: 9.9, minTemp: -1.5 },
    ]);
  });

  test("accepts a month with no days yet", () => {
    const file = dailyFile("sydney_airport_amo", []);

    expect(
      parseDailyFile(file, { folder: "sydney_airport_amo", month: "2026-10" }),
    ).toEqual([]);
  });
});
