import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { loadHistory } from "../src/pipeline/history.ts";

const rawDir = join(import.meta.dirname, "..", "data", "raw");

const maxTempHeader =
  "Product code,Bureau of Meteorology station number,Year,Month,Day,Maximum temperature (Degree C),Days of accumulation of maximum temperature,Quality";
const rainHeader =
  "Product code,Bureau of Meteorology station number,Year,Month,Day,Rainfall amount (millimetres),Period over which rainfall was measured (days),Quality";

function csv(header: string, ...rows: string[]): string {
  return [header, ...rows].map((line) => `${line}\r\n`).join("");
}

describe("loadHistory with the real files", () => {
  test("finds the hottest day at Observatory Hill", async () => {
    const records = await loadHistory(rawDir, "066062", "maxTemp");

    expect(records.find((r) => r.date === "2013-01-18")).toEqual({
      date: "2013-01-18",
      measure: "maxTemp",
      value: 45.8,
      periodDays: 1,
      quality: "Y",
    });
  });

  test("finds the wettest day at Observatory Hill", async () => {
    const records = await loadHistory(rawDir, "066062", "rain");

    expect(records.find((r) => r.date === "1986-08-06")).toMatchObject({
      measure: "rain",
      value: 327.6,
      periodDays: 1,
    });
  });

  test("keeps the multi-day rain totals at Sydney Airport", async () => {
    const records = await loadHistory(rawDir, "066037", "rain");

    expect(records.find((r) => r.date === "1936-01-06")).toMatchObject({
      value: 28.2,
      periodDays: 2,
    });
  });
});

describe("loadHistory with fixture files", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "history-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true });
  });

  async function writeZip(
    zipName: string,
    files: Record<string, string>,
  ): Promise<void> {
    const entries = Object.fromEntries(
      Object.entries(files).map(([name, text]) => [name, strToU8(text)]),
    );
    await writeFile(join(dir, zipName), zipSync(entries));
  }

  async function writeMaxTemp(...rows: string[]): Promise<void> {
    await writeZip("IDCJAC0010_066062_1800.zip", {
      "IDCJAC0010_066062_1800_Data.csv": csv(maxTempHeader, ...rows),
      "IDCJAC0010_066062_1800_Note.txt": "Notes",
    });
  }

  test("parses each row with its period and quality", async () => {
    await writeMaxTemp(
      "IDCJAC0010,066062,1996,06,28,18.5,,Y",
      "IDCJAC0010,066062,1996,06,30,18.4,2,N",
      "IDCJAC0010,066062,1996,07,01,-1.2,1,",
    );

    expect(await loadHistory(dir, "066062", "maxTemp")).toEqual([
      {
        date: "1996-06-28",
        measure: "maxTemp",
        value: 18.5,
        periodDays: null,
        quality: "Y",
      },
      {
        date: "1996-06-30",
        measure: "maxTemp",
        value: 18.4,
        periodDays: 2,
        quality: "N",
      },
      {
        date: "1996-07-01",
        measure: "maxTemp",
        value: -1.2,
        periodDays: 1,
        quality: null,
      },
    ]);
  });

  test("skips days with no value", async () => {
    await writeMaxTemp(
      "IDCJAC0010,066062,1996,06,28,18.5,1,Y",
      "IDCJAC0010,066062,1996,06,29,,,",
      "IDCJAC0010,066062,1996,06,30,,1,",
    );

    const records = await loadHistory(dir, "066062", "maxTemp");

    expect(records.map((r) => r.date)).toEqual(["1996-06-28"]);
  });

  test("accepts LF line endings", async () => {
    await writeZip("IDCJAC0009_066214_1800.zip", {
      "IDCJAC0009_066214_1800_Data.csv": `${rainHeader}\nIDCJAC0009,066214,2024,02,29,12.4,1,N\n`,
    });

    const records = await loadHistory(dir, "066214", "rain");

    expect(records).toMatchObject([{ date: "2024-02-29", value: 12.4 }]);
  });

  test("picks the ZIP by product and station only", async () => {
    await writeMaxTemp("IDCJAC0010,066062,2000,01,01,30.0,1,Y");
    await writeZip("IDCJAC0010_066214_1800.zip", {
      "IDCJAC0010_066214_1800_Data.csv": csv(
        maxTempHeader,
        "IDCJAC0010,066214,2000,01,01,31.0,1,Y",
      ),
    });
    await writeZip("IDCJAC0009_066062_1800.zip", {
      "IDCJAC0009_066062_1800_Data.csv": csv(
        rainHeader,
        "IDCJAC0009,066062,2000,01,01,5.0,1,Y",
      ),
    });

    const records = await loadHistory(dir, "066062", "maxTemp");

    expect(records).toMatchObject([{ value: 30 }]);
  });

  test("fails when the ZIP is missing", async () => {
    await writeZip("IDCJAC0009_066062_1800.zip", {
      "IDCJAC0009_066062_1800_Data.csv": csv(rainHeader),
    });

    await expect(loadHistory(dir, "066062", "maxTemp")).rejects.toThrow(
      "No IDCJAC0010_066062_*.zip",
    );
  });

  test("fails when two ZIPs match", async () => {
    await writeMaxTemp();
    await writeZip("IDCJAC0010_066062_1900.zip", {
      "IDCJAC0010_066062_1900_Data.csv": csv(maxTempHeader),
    });

    await expect(loadHistory(dir, "066062", "maxTemp")).rejects.toThrow(
      "More than one IDCJAC0010_066062_*.zip",
    );
  });

  test("fails when the ZIP has no data CSV", async () => {
    await writeZip("IDCJAC0010_066062_1800.zip", {
      "IDCJAC0010_066214_1800_Data.csv": csv(maxTempHeader),
    });

    await expect(loadHistory(dir, "066062", "maxTemp")).rejects.toThrow(
      "does not contain IDCJAC0010_066062_1800_Data.csv",
    );
  });

  test("fails when the headers have changed", async () => {
    await writeZip("IDCJAC0010_066062_1800.zip", {
      "IDCJAC0010_066062_1800_Data.csv": csv(
        maxTempHeader.replace("Degree C", "°C"),
        "IDCJAC0010,066062,2000,01,01,30.0,1,Y",
      ),
    });

    await expect(loadHistory(dir, "066062", "maxTemp")).rejects.toThrow(
      "unexpected column headers",
    );
  });

  test("fails when the file holds a different product's headers", async () => {
    await writeZip("IDCJAC0010_066062_1800.zip", {
      "IDCJAC0010_066062_1800_Data.csv": csv(rainHeader),
    });

    await expect(loadHistory(dir, "066062", "maxTemp")).rejects.toThrow(
      "unexpected column headers",
    );
  });

  test.each([
    ["IDCJAC0011,066062,2000,01,01,30.0,1,Y", "product IDCJAC0011"],
    ["IDCJAC0010,066214,2000,01,01,30.0,1,Y", "station 066214"],
    ["IDCJAC0010,066062,2000,01,01,30.0,1", "expected 8 columns, found 7"],
    ["IDCJAC0010,066062,2000,02,30,30.0,1,Y", "invalid date 2000-02-30"],
    ["IDCJAC0010,066062,2000,1,01,30.0,1,Y", "invalid date 2000-1-01"],
    ["IDCJAC0010,066062,2000,01,01,30.0C,1,Y", "invalid value 30.0C"],
    ["IDCJAC0010,066062,2000,01,01,30.0,1.5,Y", "invalid period 1.5"],
    ["IDCJAC0010,066062,2000,01,01,30.0,1,X", "invalid quality X"],
  ])("fails on the row %s", async (row, problem) => {
    await writeMaxTemp("IDCJAC0010,066062,1999,12,31,29.0,1,Y", row);

    await expect(loadHistory(dir, "066062", "maxTemp")).rejects.toThrow(
      `IDCJAC0010_066062_1800.zip line 3: ${problem}`,
    );
  });

  test.each([
    ["repeated", "IDCJAC0010,066062,2000,01,01,31.0,1,Y", "2000-01-01"],
    ["earlier", "IDCJAC0010,066062,1999,12,31,31.0,1,Y", "1999-12-31"],
  ])("fails when a date is %s", async (_, row, date) => {
    await writeMaxTemp("IDCJAC0010,066062,2000,01,01,30.0,1,Y", row);

    await expect(loadHistory(dir, "066062", "maxTemp")).rejects.toThrow(
      `line 3: ${date} is not after 2000-01-01`,
    );
  });
});
