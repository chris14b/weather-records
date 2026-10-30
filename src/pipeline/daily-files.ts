import { addDays } from "./dates.ts";

/** One day's values from a recent source. Null means missing. */
export interface RecentDay {
  date: string;
  rain: number | null;
  maxTemp: number | null;
  minTemp: number | null;
}

export interface DailyFile {
  /** The location's folder on the FTP server, such as `sydney_airport_amo`. */
  folder: string;
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

export function dailyFilePath({ folder, month }: DailyFile): string {
  return `/anon/gen/clim_data/IDCKWCDEA0/tables/nsw/${folder}/${fileName({ folder, month })}`;
}

/**
 * Parses a monthly daily file. Its rows must run day by day from the 1st, so a missing
 * row is an error rather than a missing day.
 */
export function parseDailyFile(
  bytes: Uint8Array,
  file: DailyFile,
): RecentDay[] {
  const name = fileName(file);
  const lines = new TextDecoder("latin1")
    .decode(bytes)
    .trimEnd()
    .split(/\r?\n/);
  const lineError = (index: number, problem: string) =>
    new Error(`${name} line ${String(index + 1)}: ${problem}`);

  const stationName = file.folder.replaceAll("_", " ").toUpperCase();
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

  const days: RecentDay[] = [];
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
    const [station, date = "", , rain = "", , maxTemp = "", minTemp = ""] =
      cells;
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
    });
  }
}

function fileName({ folder, month }: DailyFile): string {
  return `${folder}-${month.replace("-", "")}.csv`;
}

function monthName(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleString("en-AU", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
