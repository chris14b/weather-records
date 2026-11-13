import { join } from "node:path";
import { currentStation, type Location } from "../shared/locations.ts";
import type { RecentDay } from "./daily-files.ts";
import { type FtpHistoryDay, ftpHistorySchema } from "./ftp-history.ts";
import { gustSchema, type SavedGust } from "./gusts.ts";
import type { DailyRecord, Measure } from "./history.ts";
import { layerRecent } from "./layering.ts";
import { type DailyReadings, readingSchema } from "./readings.ts";
import { readSavedDays } from "./recent.ts";
import { readSavedRows } from "./saved-table.ts";
import { locationSeries, type Series } from "./series.ts";
import { type FromStation, loadLocationHistory } from "./stations.ts";

/** Where the pipeline's input and saved data live. */
export interface DataDirs {
  /** The history ZIPs. */
  raw: string;
  daily: string;
  snapshots: string;
  readings: string;
  gusts: string;
  ftpHistory: string;
}

const dataRoot = join(import.meta.dirname, "../../data");

export const dataDirs: DataDirs = {
  raw: join(dataRoot, "raw"),
  daily: join(dataRoot, "recent/daily"),
  snapshots: join(dataRoot, "recent/snapshots"),
  readings: join(dataRoot, "recent/readings"),
  gusts: join(dataRoot, "recent/gusts"),
  ftpHistory: join(dataRoot, "ftp-history"),
};

const measures = ["rain", "maxTemp", "minTemp"] as const satisfies Measure[];

/** A location's ZIP history for each measure, with its stations joined. */
export type Histories = Record<Measure, FromStation<DailyRecord>[]>;

export async function loadHistories(
  rawDir: string,
  location: Location,
): Promise<Histories> {
  const load = (measure: Measure) =>
    loadLocationHistory(rawDir, location, measure);
  const [rain, maxTemp, minTemp] = await Promise.all([
    load("rain"),
    load("maxTemp"),
    load("minTemp"),
  ]);
  return { rain, maxTemp, minTemp };
}

/** The last date that every measure's history covers. */
export function historyEnd(histories: Histories): string {
  return measures
    .map((measure) => {
      const last = histories[measure].at(-1);
      if (last === undefined) throw new Error(`There is no ${measure} history`);
      return last.date;
    })
    .reduce((earliest, date) => (date < earliest ? date : earliest));
}

/** Everything a location's series are made from. */
export interface SeriesSources {
  histories: Histories;
  /** The saved FTP daily values. */
  daily: readonly FromStation<RecentDay>[];
  /** The saved live observations. */
  snapshot: readonly FromStation<RecentDay>[];
  ftpHistory: readonly FtpHistoryDay[];
  readings: readonly DailyReadings[];
  gusts: readonly SavedGust[];
}

export function seriesFromSources({
  histories,
  daily,
  snapshot,
  ftpHistory,
  readings,
  gusts,
}: SeriesSources): Series[] {
  const layered = (measure: Measure) =>
    layerRecent(measure, histories[measure], [
      { source: "ftp", days: daily },
      { source: "snapshot", days: snapshot },
    ]);
  return locationSeries({
    rain: layered("rain"),
    maxTemp: layered("maxTemp"),
    minTemp: layered("minTemp"),
    ftpHistory,
    readings,
    gusts,
  });
}

/** Builds a location's series from the files on disk, without downloading anything. */
export async function readSavedSeries(
  location: Location,
  dirs: DataDirs = dataDirs,
): Promise<Series[]> {
  const current = currentStation(location).station;
  const savedDays = async (dir: string, station: string) =>
    (await readSavedDays(dir, station)).map((day) => ({ ...day, station }));

  const [histories, daily, snapshot, ftpHistory, readings, gusts] =
    await Promise.all([
      loadHistories(dirs.raw, location),
      Promise.all(
        location.stations.map(({ station }) => savedDays(dirs.daily, station)),
      ),
      savedDays(dirs.snapshots, current),
      Promise.all(
        location.stations.map(({ station }) =>
          readSavedRows(
            join(dirs.ftpHistory, `${station}.csv`),
            ftpHistorySchema,
          ),
        ),
      ),
      readSavedRows(join(dirs.readings, `${current}.csv`), readingSchema),
      readSavedRows(join(dirs.gusts, `${current}.csv`), gustSchema),
    ]);
  return seriesFromSources({
    histories,
    daily: daily.flat(),
    snapshot,
    ftpHistory: ftpHistory.flat(),
    readings,
    gusts,
  });
}
