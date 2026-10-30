import type { DailyFolder, Station } from "../shared/locations.ts";
import { addDays, monthsBetween } from "./dates.ts";
import type { Ftp } from "./ftp.ts";

/** One day's values from a recent source. Null means missing. */
export interface RecentDay {
  date: string;
  rain: number | null;
  maxTemp: number | null;
  minTemp: number | null;
}

/** One day's values from a daily file. Null means missing. */
export interface DailyFileDay extends RecentDay {
  /** The day's highest relative humidity, in %. */
  maxRelHum: number | null;
  /** The day's lowest relative humidity, in %. */
  minRelHum: number | null;
  /** The day's total solar exposure, in MJ/m². */
  solar: number | null;
}

export interface DailyFile {
  station: Pick<Station, "name" | "dailyFolder">;
  /** YYYY-MM */
  month: string;
}

const columnHeaders = [
  ",,Evapo-,,Pan,,,Maximum,Minimum,Average,",
  ",,Transpiration,Rain,Evaporation,Maximum,Minimum,Relative,Relative,10m Wind,Solar",
  "Station Name,Date,0000-2400,0900-0900,0900-0900,Temperature,Temperature,Humidity,Humidity,Speed,Radiation",
  ",,(mm),(mm),(mm),(°C),(°C),(%),(%),(m/sec),(MJ/sq m)",
];
const titleLine = 4;
const headerLine = 9;
const columnCount = 11;
const valuePattern = /^-?\d+(\.\d+)?$/;

export function dailyFilePath(file: DailyFile): string {
  return `/anon/gen/clim_data/IDCKWCDEA0/tables/nsw/${file.station.dailyFolder.name}/${fileName(file)}`;
}

/** The months from `first` to `last` (YYYY-MM) that the folder should have a file for. */
export function folderMonths(
  folder: DailyFolder,
  first: string,
  last: string,
): string[] {
  return monthsBetween(first > folder.from ? first : folder.from, last).filter(
    (month) =>
      !folder.missing?.some(({ from, to }) => month >= from && month <= to),
  );
}

/**
 * Downloads and parses a daily file. Returns undefined if it is the current month's and
 * isn't published yet; any other missing file is an error.
 */
export async function downloadDailyFile(
  ftp: Ftp,
  file: DailyFile,
  currentMonth: string,
): Promise<DailyFileDay[] | undefined> {
  const path = dailyFilePath(file);
  const bytes = await ftp.download(path);
  if (bytes === undefined) {
    if (file.month === currentMonth) return undefined;
    throw new Error(`ftp://ftp.bom.gov.au${path} does not exist`);
  }
  return parseDailyFile(bytes, file);
}

/**
 * Parses a monthly daily file. Its rows must run day by day from the 1st, so a missing
 * row is an error rather than a missing day.
 */
export function parseDailyFile(
  bytes: Uint8Array,
  file: DailyFile,
): DailyFileDay[] {
  const name = fileName(file);
  const lines = new TextDecoder("latin1")
    .decode(bytes)
    .trimEnd()
    .split(/\r?\n/);
  const lineError = (index: number, problem: string) =>
    new Error(`${name} line ${String(index + 1)}: ${problem}`);

  // The daily files leave "AWS" out of the official station name.
  const stationName = file.station.name.replace(/ AWS\b/, "");
  const expectedTitle = `Daily Evapotranspiration for ${stationName} New South Wales for ${monthName(file.month)}`;
  const title = lines[titleLine]?.split(",")[0];
  if (title !== expectedTitle) {
    throw lineError(
      titleLine,
      `expected the title "${expectedTitle}", found "${title ?? ""}"`,
    );
  }
  for (const [offset, expected] of columnHeaders.entries()) {
    const found = lines[headerLine + offset];
    if (found !== expected) {
      throw lineError(
        headerLine + offset,
        `unexpected column headers.\n  expected: ${expected}\n  found:    ${found ?? ""}`,
      );
    }
  }

  const days: DailyFileDay[] = [];
  const firstRow = headerLine + columnHeaders.length;
  for (let index = firstRow; ; index++) {
    const line = lines[index];
    if (line === undefined) {
      throw new Error(`${name} ends without a Totals line`);
    }
    const cells = line.split(",");
    if (cells[0] === "Totals:") {
      if (index !== lines.length - 1) {
        throw lineError(index + 1, "unexpected line after Totals");
      }
      return days;
    }
    if (cells.length !== columnCount) {
      throw lineError(
        index,
        `expected ${String(columnCount)} columns, found ${String(cells.length)}`,
      );
    }
    const [
      station,
      date = "",
      ,
      rain = "",
      ,
      maxTemp = "",
      minTemp = "",
      maxRelHum = "",
      minRelHum = "",
      ,
      solar = "",
    ] = cells;
    if (station !== stationName) {
      throw lineError(
        index,
        `station ${station ?? ""} does not match ${stationName}`,
      );
    }
    const expectedDate = addDays(`${file.month}-01`, days.length);
    const isoDate = date.split("/").reverse().join("-");
    if (isoDate !== expectedDate) {
      throw lineError(index, `expected ${expectedDate}, found ${date}`);
    }
    const value = (cell: string): number | null => {
      const text = cell.trim();
      if (text === "") return null;
      if (!valuePattern.test(text)) {
        throw lineError(index, `invalid value ${cell}`);
      }
      return Number(text);
    };
    days.push({
      date: isoDate,
      rain: value(rain),
      maxTemp: value(maxTemp),
      minTemp: value(minTemp),
      maxRelHum: value(maxRelHum),
      minRelHum: value(minRelHum),
      solar: value(solar),
    });
  }
}

function fileName({ station, month }: DailyFile): string {
  return `${station.dailyFolder.name}-${month.replace("-", "")}.csv`;
}

function monthName(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleString("en-AU", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
