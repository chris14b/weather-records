import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Location } from "../shared/locations.ts";
import {
  dailyFilePath,
  parseDailyFile,
  type RecentDay,
} from "./daily-files.ts";
import { addDays, isValidDate, monthsBetween } from "./dates.ts";
import type { Ftp } from "./ftp.ts";
import { type FromStation, joinStations } from "./stations.ts";

const header = "date,rain,maxTemp,minTemp";
const valuePattern = /^-?\d+(\.\d+)?$/;

export interface DailyUpdate {
  ftp: Ftp;
  /** Where the saved copies live, one CSV per station. */
  dir: string;
  location: Location;
  /** The last date that every measure's ZIP history covers. Saved days up to here are pruned. */
  historyEnd: string;
  /** Today in Sydney, as YYYY-MM-DD. */
  today: string;
}

/**
 * Fetches the location's daily files from the month of the first day it doesn't have yet
 * up to the current month, saves them over the old copies, and prunes the days the
 * history covers. Returns the saved days.
 */
export async function updateDailyFiles({
  ftp,
  dir,
  location,
  historyEnd,
  today,
}: DailyUpdate): Promise<FromStation<RecentDay>[]> {
  const saved = (
    await Promise.all(
      location.stations.map(async ({ station }) =>
        (await readSavedDays(dir, station)).map((day) => ({ ...day, station })),
      ),
    )
  ).flat();

  const lastSaved = saved.reduce(
    (latest, { date }) => (date > latest ? date : latest),
    historyEnd,
  );
  const currentMonth = today.slice(0, 7);
  const months = monthsBetween(addDays(lastSaved, 1).slice(0, 7), currentMonth);

  const fetchedMonths = new Set<string>();
  const fetched: RecentDay[] = [];
  for (const month of months) {
    const file = { folder: location.dailyFolder, month };
    const bytes = await ftp.download(dailyFilePath(file));
    if (bytes === undefined) {
      if (month === currentMonth) continue;
      throw new Error(
        `ftp://ftp.bom.gov.au${dailyFilePath(file)} does not exist`,
      );
    }
    fetched.push(...parseDailyFile(bytes, file));
    fetchedMonths.add(month);
  }

  const fetchedByStation = joinStations(
    location.stations,
    new Map(location.stations.map(({ station }) => [station, fetched])),
  );
  const days = [
    ...saved.filter(({ date }) => !fetchedMonths.has(date.slice(0, 7))),
    ...fetchedByStation,
  ]
    .filter(({ date }) => date > historyEnd)
    .sort((a, b) => a.date.localeCompare(b.date));

  await mkdir(dir, { recursive: true });
  await Promise.all(
    location.stations.map(({ station }) =>
      writeSavedDays(
        dir,
        station,
        days.filter((day) => day.station === station),
      ),
    ),
  );
  return days;
}

/** Reads a station's saved days, or none if it has no file. */
export async function readSavedDays(
  dir: string,
  station: string,
): Promise<RecentDay[]> {
  const path = savedPath(dir, station);
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return parseSavedDays(text, path);
}

function parseSavedDays(text: string, path: string): RecentDay[] {
  const [first, ...rows] = text.split("\n");
  if (first !== header) {
    throw new Error(
      `${path} has unexpected column headers.\n  expected: ${header}\n  found:    ${first ?? ""}`,
    );
  }
  const days: RecentDay[] = [];
  let previousDate = "";
  for (const [index, row] of rows.entries()) {
    if (row === "") continue;
    const rowError = (problem: string) =>
      new Error(`${path} line ${String(index + 2)}: ${problem}`);
    const cells = row.split(",");
    if (cells.length !== 4) {
      throw rowError(`expected 4 columns, found ${String(cells.length)}`);
    }
    const [date = "", rain = "", maxTemp = "", minTemp = ""] = cells;
    if (!isValidDate(date)) throw rowError(`invalid date ${date}`);
    if (date <= previousDate) {
      throw rowError(`${date} is not after ${previousDate}`);
    }
    previousDate = date;
    const value = (cell: string): number | null => {
      if (cell === "") return null;
      if (!valuePattern.test(cell)) throw rowError(`invalid value ${cell}`);
      return Number(cell);
    };
    days.push({
      date,
      rain: value(rain),
      maxTemp: value(maxTemp),
      minTemp: value(minTemp),
    });
  }
  return days;
}

async function writeSavedDays(
  dir: string,
  station: string,
  days: readonly RecentDay[],
): Promise<void> {
  const path = savedPath(dir, station);
  if (days.length === 0) {
    await rm(path, { force: true });
    return;
  }
  const cell = (value: number | null) => (value === null ? "" : String(value));
  const rows = days.map(
    ({ date, rain, maxTemp, minTemp }) =>
      `${date},${cell(rain)},${cell(maxTemp)},${cell(minTemp)}`,
  );
  await writeFile(path, [header, ...rows, ""].join("\n"));
}

function savedPath(dir: string, station: string): string {
  return join(dir, `${station}.csv`);
}
