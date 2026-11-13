import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { currentStation, locations } from "../shared/locations.ts";
import { addDays, sydneyDate } from "./dates.ts";
import { inContext } from "./errors.ts";
import {
  addDwoReadings,
  downloadPage,
  dwoFileMonth,
  dwoUrl,
  missingDwoDays,
  parseDwo,
} from "./dwo.ts";
import { addDwoGusts, gustSchema } from "./gusts.ts";
import { readingSchema, readingsKeptFrom } from "./readings.ts";
import { readSavedRows, writeSavedRows } from "./saved-table.ts";

const dataRoot = join(import.meta.dirname, "../../data");
const downloadsDir = join(dataRoot, "dwo");
const readingsDir = join(dataRoot, "recent/readings");
const gustsDir = join(dataRoot, "recent/gusts");

const today = sydneyDate(new Date());
const keptFrom = readingsKeptFrom(today);

const downloads = await readdir(downloadsDir).catch((error: unknown) => {
  if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
  throw error;
});
const unknown = downloads.filter(
  (name) =>
    name.endsWith(".csv") &&
    !locations.some(
      (location) =>
        currentStation(location).dwo === dwoFileMonth(name)?.product,
    ),
);
if (unknown.length > 0) {
  throw new Error(
    `${downloadsDir} has files for no location: ${unknown.join(", ")}`,
  );
}

const imports = await Promise.all(
  locations.flatMap((location) => {
    const station = currentStation(location);
    const { dwo } = station;
    if (dwo === undefined) return [];
    return [
      (async () => {
        const files = downloads
          .filter((name) => dwoFileMonth(name)?.product === dwo)
          .sort();
        const dwoRows = await Promise.all(
          files.map(async (name) =>
            parseDwo(await readFile(join(downloadsDir, name)), name, station),
          ),
        );
        const path = join(readingsDir, `${station.station}.csv`);
        const saved = await readSavedRows(path, readingSchema);
        const readings = inContext(location.name, () =>
          addDwoReadings(saved, dwoRows.flat(), keptFrom),
        );
        const gustsPath = join(gustsDir, `${station.station}.csv`);
        const gusts =
          station.measuresWind === false
            ? undefined
            : addDwoGusts(
                await readSavedRows(gustsPath, gustSchema),
                dwoRows.flat(),
                keptFrom,
                today,
              );
        return {
          location,
          station,
          dwo,
          files,
          path,
          readings,
          gustsPath,
          gusts,
        };
      })(),
    ];
  }),
);

const pageLocations = [];
for (const {
  location,
  station,
  dwo,
  files,
  path,
  readings,
  gustsPath,
  gusts,
} of imports) {
  await writeSavedRows(path, readingSchema, readings);
  if (gusts !== undefined) {
    await writeSavedRows(gustsPath, gustSchema, gusts);
  }
  const missing = missingDwoDays(readings, gusts, keptFrom, addDays(today, -1));
  console.log(
    `${location.name} (${station.station}): imported ${String(files.length)} files, ${String(readings.length)} days of readings saved`,
  );
  if (gusts !== undefined) {
    const stronger = gusts.filter(
      ({ feedGust, dwoGust }) =>
        feedGust !== null && dwoGust !== null && dwoGust > feedGust,
    );
    const weaker = gusts.filter(
      ({ feedGust, dwoGust }) =>
        feedGust !== null && dwoGust !== null && dwoGust < feedGust,
    );
    console.log(
      `  ${String(gusts.filter(({ dwoGust }) => dwoGust !== null).length)} days with the DWO's gust, ${String(stronger.length)} stronger than the runs saw`,
    );
    for (const { date, feedGust, dwoGust } of weaker) {
      console.log(
        `  ${date}: the DWO's gust of ${String(dwoGust)} km/h is weaker than the runs' ${String(feedGust)} km/h`,
      );
    }
  }
  if (missing.size === 0) console.log("  nothing missing");
  for (const [month, dates] of missing) {
    const days = dates.length === 1 ? "day" : "days";
    console.log(
      `  ${month}: ${String(dates.length)} ${days} the DWO could fill`,
    );
  }
  pageLocations.push({
    name: location.name,
    links: [...missing].map(([month, dates]) => ({
      month,
      url: dwoUrl(dwo, month),
      missingDays: dates.length,
      downloaded: files.some((name) => dwoFileMonth(name)?.month === month),
    })),
  });
}

const pagePath = join(downloadsDir, "download.html");
await mkdir(downloadsDir, { recursive: true });
await writeFile(pagePath, downloadPage(pageLocations));
console.log(`\nLinks to the missing months: ${pathToFileURL(pagePath).href}`);
