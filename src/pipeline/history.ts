import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { unzipSync } from "fflate";
import { isValidDate } from "./dates.ts";

export type Measure = "rain" | "maxTemp" | "minTemp";

export type Quality = "Y" | "N";

export interface DailyRecord {
  date: string;
  measure: Measure;
  value: number;
  /** Days the value covers; more than 1 is a multi-day total. Null where the file leaves it blank. */
  periodDays: number | null;
  quality: Quality | null;
}

interface Product {
  code: string;
  header: string;
}

const products: Record<Measure, Product> = {
  rain: {
    code: "IDCJAC0009",
    header:
      "Product code,Bureau of Meteorology station number,Year,Month,Day,Rainfall amount (millimetres),Period over which rainfall was measured (days),Quality",
  },
  maxTemp: {
    code: "IDCJAC0010",
    header:
      "Product code,Bureau of Meteorology station number,Year,Month,Day,Maximum temperature (Degree C),Days of accumulation of maximum temperature,Quality",
  },
  minTemp: {
    code: "IDCJAC0011",
    header:
      "Product code,Bureau of Meteorology station number,Year,Month,Day,Minimum temperature (Degree C),Days of accumulation of minimum temperature,Quality",
  },
};

const columnCount = 8;
const valuePattern = /^-?\d+(\.\d+)?$/;
const periodPattern = /^\d+$/;

/** Loads one station's Climate Data Online history for a measure, skipping days with no value. */
export async function loadHistory(
  rawDir: string,
  station: string,
  measure: Measure,
): Promise<DailyRecord[]> {
  const { code } = products[measure];
  const zipPath = await findZip(rawDir, code, station);
  const csv = readDataCsv(zipPath, await readFile(zipPath));
  return parseCsv(csv, { file: basename(zipPath), code, station, measure });
}

async function findZip(
  rawDir: string,
  code: string,
  station: string,
): Promise<string> {
  const prefix = `${code}_${station}_`;
  const matches = (await readdir(rawDir)).filter(
    (name) => name.startsWith(prefix) && name.endsWith(".zip"),
  );
  if (matches.length === 0) {
    throw new Error(`No ${prefix}*.zip in ${rawDir}`);
  }
  if (matches.length > 1) {
    throw new Error(
      `More than one ${prefix}*.zip in ${rawDir}: ${matches.join(", ")}`,
    );
  }
  return join(rawDir, matches[0] ?? "");
}

function readDataCsv(zipPath: string, zip: Uint8Array): string {
  const entryName = `${basename(zipPath, ".zip")}_Data.csv`;
  const entry = unzipSync(zip, { filter: (file) => file.name === entryName })[
    entryName
  ];
  if (entry === undefined) {
    throw new Error(`${basename(zipPath)} does not contain ${entryName}`);
  }
  return new TextDecoder().decode(entry);
}

interface CsvSource {
  file: string;
  code: string;
  station: string;
  measure: Measure;
}

function parseCsv(csv: string, source: CsvSource): DailyRecord[] {
  const [header, ...rows] = csv.split(/\r?\n/);
  const expectedHeader = products[source.measure].header;
  if (header !== expectedHeader) {
    throw new Error(
      `${source.file} has unexpected column headers.\n  expected: ${expectedHeader}\n  found:    ${header ?? ""}`,
    );
  }

  const records: DailyRecord[] = [];
  let previousDate = "";
  for (const [index, row] of rows.entries()) {
    if (row === "") continue;
    const rowError = (problem: string) =>
      new Error(`${source.file} line ${String(index + 2)}: ${problem}`);

    const cells = row.split(",");
    if (cells.length !== columnCount) {
      throw rowError(
        `expected ${String(columnCount)} columns, found ${String(cells.length)}`,
      );
    }
    const [
      code = "",
      station = "",
      year,
      month,
      day,
      value = "",
      period = "",
      quality,
    ] = cells;
    if (code !== source.code) {
      throw rowError(`product ${code} does not match ${source.code}`);
    }
    if (station !== source.station) {
      throw rowError(`station ${station} does not match ${source.station}`);
    }

    const date = `${year ?? ""}-${month ?? ""}-${day ?? ""}`;
    if (!isValidDate(date)) throw rowError(`invalid date ${date}`);
    if (date <= previousDate) {
      throw rowError(`${date} is not after ${previousDate}`);
    }
    previousDate = date;

    if (value === "") continue;
    if (!valuePattern.test(value)) throw rowError(`invalid value ${value}`);
    if (period !== "" && !periodPattern.test(period)) {
      throw rowError(`invalid period ${period}`);
    }
    if (quality !== "" && quality !== "Y" && quality !== "N") {
      throw rowError(`invalid quality ${quality ?? ""}`);
    }

    records.push({
      date,
      measure: source.measure,
      value: Number(value),
      periodDays: period === "" ? null : Number(period),
      quality: quality === "" ? null : quality,
    });
  }
  return records;
}
