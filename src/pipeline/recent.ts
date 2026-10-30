import { join } from "node:path";
import type { Location } from "../shared/locations.ts";
import {
  downloadDailyFile,
  folderMonths,
  type RecentDay,
} from "./daily-files.ts";
import { addDays } from "./dates.ts";
import type { Ftp } from "./ftp.ts";
import { readSavedRows, writeSavedRows } from "./saved-table.ts";
import { type FromStation, joinStations } from "./stations.ts";

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
 * Fetches each station's daily files, for its own period, from the month of the first day
 * not saved yet up to the current month. Saves them over the old copies, prunes the days
 * the history covers, and returns the saved days.
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
  const firstMissing = addDays(lastSaved, 1);
  const currentMonth = today.slice(0, 7);

  const fetchedMonths = new Set<string>();
  const fetched = new Map<string, RecentDay[]>();
  for (const [index, station] of location.stations.entries()) {
    const until = location.stations[index + 1]?.from;
    const first = latest(firstMissing, station.from ?? firstMissing);
    const last =
      until === undefined ? today : earliest(today, addDays(until, -1));
    const days: RecentDay[] = [];
    const months =
      first <= last
        ? folderMonths(station.dailyFolder, first.slice(0, 7), last.slice(0, 7))
        : [];
    for (const month of months) {
      const fileDays = await downloadDailyFile(
        ftp,
        { station, month },
        currentMonth,
      );
      if (fileDays === undefined) continue;
      days.push(
        ...fileDays.map(({ date, rain, maxTemp, minTemp }) => ({
          date,
          rain,
          maxTemp,
          minTemp,
        })),
      );
      fetchedMonths.add(`${station.station} ${month}`);
    }
    fetched.set(station.station, days);
  }

  const days = [
    ...saved.filter(
      ({ station, date }) =>
        !fetchedMonths.has(`${station} ${date.slice(0, 7)}`),
    ),
    ...joinStations(location.stations, fetched),
  ]
    .filter(({ date }) => date > historyEnd)
    .sort((a, b) => a.date.localeCompare(b.date));

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

/** The columns of a saved CSV of daily values, after the date. */
export const dailySchema = {
  rain: "number",
  maxTemp: "number",
  minTemp: "number",
} as const;

/** Reads a station's saved days, or none if it has no file. */
export function readSavedDays(
  dir: string,
  station: string,
): Promise<RecentDay[]> {
  return readSavedRows(savedPath(dir, station), dailySchema);
}

/** Writes a station's saved days, deleting its file when there are none. */
export function writeSavedDays(
  dir: string,
  station: string,
  days: readonly RecentDay[],
): Promise<void> {
  return writeSavedRows(savedPath(dir, station), dailySchema, days);
}

function savedPath(dir: string, station: string): string {
  return join(dir, `${station}.csv`);
}

function latest(a: string, b: string): string {
  return a > b ? a : b;
}

function earliest(a: string, b: string): string {
  return a < b ? a : b;
}
