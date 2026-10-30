import { join } from "node:path";
import { currentStation, type Location } from "../shared/locations.ts";
import type { RecentDay } from "./daily-files.ts";
import { forecastPath } from "./forecast.ts";
import type { Ftp } from "./ftp.ts";
import { observationsPath, parseObservations } from "./observations.ts";
import {
  type DailyReadings,
  parseReadings,
  readingSchema,
  readingsArchivePath,
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
  location: Location;
  /** The last date that every measure's ZIP history covers. Saved observations up to here are pruned. */
  historyEnd: string;
}

export interface Snapshot {
  observations: FromStation<RecentDay>[];
  readings: FromStation<DailyReadings>[];
}

/**
 * Saves the location's closed live observations and its 9am and 3pm readings over the
 * saved ones, and returns everything saved. Readings are never pruned, because no ZIP
 * has them.
 */
export async function updateSnapshot({
  feeds,
  snapshotDir,
  readingsDir,
  location,
  historyEnd,
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
  );
  await writeSavedRows(readingsPath, readingSchema, readings);

  return {
    observations: observations.map((day) => ({ ...day, station })),
    readings: readings.map((day) => ({ ...day, station })),
  };
}
