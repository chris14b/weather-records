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
  missingReadings,
  parseDwo,
} from "./dwo.ts";
import { readingSchema, readingsKeptFrom } from "./readings.ts";
import { readSavedRows, writeSavedRows } from "./saved-table.ts";

const dataRoot = join(import.meta.dirname, "../../data");
const downloadsDir = join(dataRoot, "dwo");
const readingsDir = join(dataRoot, "recent/readings");

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
        return { location, station, dwo, files, path, readings };
      })(),
    ];
  }),
);

const pageLocations = [];
for (const { location, station, dwo, files, path, readings } of imports) {
  await writeSavedRows(path, readingSchema, readings);
  const missing = missingReadings(readings, keptFrom, addDays(today, -1));
  console.log(
    `${location.name} (${station.station}): imported ${String(files.length)} files, ${String(readings.length)} days saved`,
  );
  if (missing.size === 0) console.log("  no readings missing");
  for (const [month, dates] of missing) {
    console.log(`  ${month}: ${String(dates.length)} days missing a reading`);
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
