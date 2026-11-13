import { join } from "node:path";
import { currentStation, type Location } from "../shared/locations.ts";
import type { RecentDay } from "./daily-files.ts";
import { forecastPath } from "./forecast.ts";
import type { Ftp } from "./ftp.ts";
import { feedGusts, gustSchema, type SavedGust } from "./gusts.ts";
import {
  observationsPath,
  parseObservations,
  parseRunningValues,
} from "./observations.ts";
import {
  type DailyReadings,
  parseReadings,
  readingSchema,
  readingsArchivePath,
  readingsKeptFrom,
} from "./readings.ts";
import { dailySchema, readSavedDays, writeSavedDays } from "./recent.ts";
import { mergeRows, readSavedRows, writeSavedRows } from "./saved-table.ts";
import type { FromStation } from "./stations.ts";

/** The live feeds, as downloaded. Each covers every NSW station or town. */
export interface LiveFeeds {
  observations: Uint8Array;
  readings: Uint8Array;
  forecast: Uint8Array;
}

export async function downloadLiveFeeds(ftp: Ftp): Promise<LiveFeeds> {
  const download = async (path: string) => {
    const bytes = await ftp.download(path);
    if (bytes === undefined) {
      throw new Error(`ftp://ftp.bom.gov.au${path} does not exist`);
    }
    return bytes;
  };
  return {
    observations: await download(observationsPath),
    readings: await download(readingsArchivePath),
    forecast: await download(forecastPath),
  };
}

export interface SnapshotUpdate {
  feeds: LiveFeeds;
  /** Where the saved live observations live, one CSV per station. */
  snapshotDir: string;
  /** Where the saved 9am and 3pm readings live, one CSV per station. */
  readingsDir: string;
  /** Where the saved gusts live, one CSV per station. */
  gustsDir: string;
  location: Location;
  /** The last date that every measure's ZIP history covers. Saved observations up to here are pruned. */
  historyEnd: string;
  /** Today in Sydney, as YYYY-MM-DD. Saved readings and gusts more than about 13 months older are pruned. */
  today: string;
}

export interface Snapshot {
  observations: FromStation<RecentDay>[];
  readings: FromStation<DailyReadings>[];
  gusts: FromStation<SavedGust>[];
}

/**
 * Saves the location's closed live observations, its 9am and 3pm readings and today's gust
 * so far over the saved ones, and returns everything saved. Readings and gusts are kept only
 * as long as the Daily Weather Observations, which can fill their gaps, keep them.
 */
export async function updateSnapshot({
  feeds,
  snapshotDir,
  readingsDir,
  gustsDir,
  location,
  historyEnd,
  today,
}: SnapshotUpdate): Promise<Snapshot> {
  const { station } = currentStation(location);

  const observations = mergeRows(
    dailySchema,
    await readSavedDays(snapshotDir, station),
    parseObservations(feeds.observations, location),
  ).filter(({ date }) => date > historyEnd);
  await writeSavedDays(snapshotDir, station, observations);

  const readingsPath = join(readingsDir, `${station}.csv`);
  const readings = mergeRows(
    readingSchema,
    await readSavedRows(readingsPath, readingSchema),
    parseReadings(feeds.readings, location),
  ).filter(({ date }) => date >= readingsKeptFrom(today));
  await writeSavedRows(readingsPath, readingSchema, readings);

  const gustsPath = join(gustsDir, `${station}.csv`);
  const gusts = mergeRows(
    gustSchema,
    await readSavedRows(gustsPath, gustSchema),
    feedGusts(parseRunningValues(feeds.observations, location)),
  ).filter(({ date }) => date >= readingsKeptFrom(today));
  await writeSavedRows(gustsPath, gustSchema, gusts);

  return {
    observations: observations.map((day) => ({ ...day, station })),
    readings: readings.map((day) => ({ ...day, station })),
    gusts: gusts.map((day) => ({ ...day, station })),
  };
}
