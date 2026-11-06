import { join } from "node:path";
import { currentStation, type Location } from "../shared/locations.ts";
import { ftpHistorySchema } from "./ftp-history.ts";
import { layerRecent } from "./layering.ts";
import { readingSchema } from "./readings.ts";
import { readSavedDays } from "./recent.ts";
import { readSavedRows } from "./saved-table.ts";
import { locationSeries, type Series } from "./series.ts";
import { loadLocationHistory } from "./stations.ts";

/** Builds a location's series from the files on disk, without downloading anything. */
export async function readSavedSeries(location: Location): Promise<Series[]> {
  const current = currentStation(location).station;
  const daily = (
    await Promise.all(
      location.stations.map(async ({ station }) =>
        (await readSavedDays("data/recent/daily", station)).map((day) => ({
          ...day,
          station,
        })),
      ),
    )
  ).flat();
  const snapshot = (await readSavedDays("data/recent/snapshots", current)).map(
    (day) => ({ ...day, station: current }),
  );
  const layered = async (measure: "rain" | "maxTemp" | "minTemp") =>
    layerRecent(
      measure,
      await loadLocationHistory("data/raw", location, measure),
      [
        { source: "ftp", days: daily },
        { source: "snapshot", days: snapshot },
      ],
    );

  const [rain, maxTemp, minTemp, ftpHistory, readings] = await Promise.all([
    layered("rain"),
    layered("maxTemp"),
    layered("minTemp"),
    Promise.all(
      location.stations.map(({ station }) =>
        readSavedRows(
          join("data/ftp-history", `${station}.csv`),
          ftpHistorySchema,
        ),
      ),
    ),
    readSavedRows(
      join("data/recent/readings", `${current}.csv`),
      readingSchema,
    ),
  ]);
  return locationSeries({
    rain,
    maxTemp,
    minTemp,
    ftpHistory: ftpHistory.flat(),
    readings,
  });
}
