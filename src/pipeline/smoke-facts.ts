import { join } from "node:path";
import { currentStation, locations } from "../shared/locations.ts";
import { generateDailyFacts } from "./daily-facts.ts";
import { sydneyDate } from "./dates.ts";
import { ftpHistorySchema } from "./ftp-history.ts";
import { layerRecent } from "./layering.ts";
import { readingSchema } from "./readings.ts";
import { readSavedDays } from "./recent.ts";
import { readSavedRows } from "./saved-table.ts";
import { locationSeries } from "./series.ts";
import { loadLocationHistory } from "./stations.ts";

const [
  locationId = "sydney-observatory-hill",
  date = sydneyDate(new Date()),
  maxRank = "3",
] = process.argv.slice(2);
const location = locations.find(({ id }) => id === locationId);
if (location === undefined) {
  throw new Error(
    `Unknown location ${locationId}; use one of ${locations.map(({ id }) => id).join(", ")}`,
  );
}
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

const series = locationSeries({
  rain: await layered("rain"),
  maxTemp: await layered("maxTemp"),
  minTemp: await layered("minTemp"),
  ftpHistory: (
    await Promise.all(
      location.stations.map(({ station }) =>
        readSavedRows(
          join("data/ftp-history", `${station}.csv`),
          ftpHistorySchema,
        ),
      ),
    )
  ).flat(),
  readings: await readSavedRows(
    join("data/recent/readings", `${current}.csv`),
    readingSchema,
  ),
});

const facts = generateDailyFacts({
  locationId,
  series,
  windowEnd: date,
  windowDays: 1,
});
console.log(`${location.name} on ${date}, ranks up to ${maxRank}:`);
console.table(
  facts
    .filter(({ rank }) => rank <= Number(maxRank))
    .map(({ since, beatenBy, gaps, ...fact }) => ({
      measure: fact.measure,
      direction: fact.direction,
      value: fact.value,
      status: fact.status,
      comparison: fact.comparison,
      rank: fact.rank,
      ties: fact.ties,
      compared: fact.compared,
      since: since?.date ?? "",
      beatenBy: beatenBy?.date ?? "",
      missing: fact.missingDays,
      gaps: gaps.map(({ from, to }) => `${from}..${to}`).join(" "),
    })),
);
