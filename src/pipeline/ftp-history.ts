import { join } from "node:path";
import type { Location, Station } from "../shared/locations.ts";
import { downloadDailyFile, folderMonths } from "./daily-files.ts";
import { addDays } from "./dates.ts";
import type { Ftp } from "./ftp.ts";
import { readSavedRows, type SavedRow, writeSavedRows } from "./saved-table.ts";
import type { FromStation } from "./stations.ts";

/** The columns of a saved CSV of the daily measures that only the daily files have. */
export const ftpHistorySchema = {
  maxRelHum: "number",
  minRelHum: "number",
  solar: "number",
} as const;

export type FtpHistoryDay = SavedRow<typeof ftpHistorySchema>;

export interface FtpHistoryUpdate {
  ftp: Ftp;
  /** Where the saved history lives, one CSV per station. */
  dir: string;
  location: Location;
  /** Today in Sydney, as YYYY-MM-DD. */
  today: string;
  onSaved?: (station: Station, month: string) => void;
}

/**
 * Fetches each station's daily files, for its own period, from the month of its first day
 * not saved yet (or its folder's first month) up to the current month. Saves after each
 * month, so an interrupted run carries on where it stopped. Never prunes, because no ZIP
 * has these measures. Returns everything saved.
 */
export async function updateFtpHistory({
  ftp,
  dir,
  location,
  today,
  onSaved,
}: FtpHistoryUpdate): Promise<FromStation<FtpHistoryDay>[]> {
  const currentMonth = today.slice(0, 7);
  const history: FromStation<FtpHistoryDay>[] = [];
  for (const [index, station] of location.stations.entries()) {
    const path = join(dir, `${station.station}.csv`);
    let saved = await readSavedRows(path, ftpHistorySchema);
    const from = station.from ?? "";
    const until = location.stations[index + 1]?.from;
    const inPeriod = (date: string) =>
      date >= from && (until === undefined || date < until) && date <= today;

    const lastSaved = saved.at(-1)?.date;
    const first = lastSaved === undefined ? from : addDays(lastSaved, 1);
    const last =
      until === undefined || today < until ? today : addDays(until, -1);
    const months =
      first <= last
        ? folderMonths(station.dailyFolder, first.slice(0, 7), last.slice(0, 7))
        : [];

    for (const month of months) {
      const days = await downloadDailyFile(
        ftp,
        { station, month },
        currentMonth,
      );
      if (days === undefined) continue;
      saved = [
        ...saved.filter(({ date }) => !date.startsWith(month)),
        ...days
          .filter(({ date }) => inPeriod(date))
          .map(({ date, maxRelHum, minRelHum, solar }) => ({
            date,
            maxRelHum,
            minRelHum,
            solar,
          })),
      ];
      await writeSavedRows(path, ftpHistorySchema, saved);
      onSaved?.(station, month);
    }
    history.push(...saved.map((day) => ({ ...day, station: station.station })));
  }
  return history;
}
