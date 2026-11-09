import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { FactsFile, LocationFacts } from "../shared/facts.ts";
import {
  locations as allLocations,
  type Location,
  stationOffsets,
} from "../shared/locations.ts";
import { generateCandidates } from "./candidates.ts";
import { addDays, sydneyDate } from "./dates.ts";
import { daylightAround } from "./daylight-facts.ts";
import { forecastStart } from "./forecast-facts.ts";
import { parseForecast } from "./forecast.ts";
import { type Ftp, withDownloadCache } from "./ftp.ts";
import { updateFtpHistory } from "./ftp-history.ts";
import { updateDailyFiles } from "./recent.ts";
import {
  type DataDirs,
  dataDirs,
  historyEnd,
  loadHistories,
  seriesFromSources,
} from "./saved-series.ts";
import { selectFacts } from "./selection.ts";
import {
  downloadLiveFeeds,
  type LiveFeeds,
  updateSnapshot,
} from "./snapshots.ts";

/** Inside Vite's public directory, so the site serves it in development and the build copies it. */
export const factsPath = join(import.meta.dirname, "../site/public/facts.json");

export interface BuildRequest {
  ftp: Ftp;
  now: Date;
  locations?: readonly Location[];
  dirs?: DataDirs;
}

/**
 * Fetches what's new from BOM, saves it over the data on disk, and chooses each
 * location's facts as they stand at `now`.
 */
export async function buildFactsFile({
  ftp,
  now,
  locations = allLocations,
  dirs = dataDirs,
}: BuildRequest): Promise<FactsFile> {
  const cached = withDownloadCache(ftp);
  const feeds = await downloadLiveFeeds(cached);
  const facts: LocationFacts[] = [];
  for (const location of locations) {
    facts.push(
      await buildLocationFacts({ ftp: cached, feeds, location, now, dirs }),
    );
  }
  return { generatedAt: now.toISOString(), locations: facts };
}

interface LocationBuild {
  ftp: Ftp;
  feeds: LiveFeeds;
  location: Location;
  now: Date;
  dirs: DataDirs;
}

async function buildLocationFacts({
  ftp,
  feeds,
  location,
  now,
  dirs,
}: LocationBuild): Promise<LocationFacts> {
  const today = sydneyDate(now);
  const histories = await loadHistories(dirs.raw, location);
  const end = historyEnd(histories);
  const daily = await updateDailyFiles({
    ftp,
    dir: dirs.daily,
    location,
    historyEnd: end,
    today,
  });
  const ftpHistory = await updateFtpHistory({
    ftp,
    dir: dirs.ftpHistory,
    location,
    today,
  });
  const snapshot = await updateSnapshot({
    feeds,
    snapshotDir: dirs.snapshots,
    readingsDir: dirs.readings,
    location,
    historyEnd: end,
    today,
  });

  const series = seriesFromSources({
    histories,
    daily,
    snapshot: snapshot.observations,
    ftpHistory,
    readings: snapshot.readings,
  });
  const { days } = parseForecast(feeds.forecast, location.forecastArea);
  const forecast = { days, from: forecastStart(now) };
  const facts = generateCandidates({
    locationId: location.id,
    series,
    windowEnd: today,
    offsets: stationOffsets(location),
    forecast,
  });
  return {
    locationId: location.id,
    pages: [today, addDays(today, 1)].map((date) =>
      selectFacts({
        date,
        facts,
        series,
        forecast,
        daylight: daylightAround(location, date),
      }),
    ),
    forecast: days.map(({ date, iconCode, precis }) => ({
      date,
      iconCode,
      precis,
    })),
  };
}

/** Writes the file whole or not at all, so a failed run leaves the last one in place. */
export async function writeFactsFile(
  path: string,
  file: FactsFile,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const partial = `${path}.partial`;
  await writeFile(partial, `${JSON.stringify(file, null, 2)}\n`);
  await rename(partial, path);
}
