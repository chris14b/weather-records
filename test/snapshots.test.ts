import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { locations, type Location } from "../src/shared/locations.ts";
import type { Ftp } from "../src/pipeline/ftp.ts";
import {
  downloadLiveFeeds,
  type LiveFeeds,
  updateSnapshot,
} from "../src/pipeline/snapshots.ts";
import { readingSchema } from "../src/pipeline/readings.ts";
import {
  fixture,
  observationsAt,
  readingsArchive,
  readingsJson,
} from "./live-feeds.ts";

const [observatoryHill] = locations as [Location];

const feedsAt = (observationsUtc: string): LiveFeeds => ({
  observations: Buffer.from(observationsAt(observationsUtc)),
  readings: readingsArchive({
    "IDN60910.94768.json": readingsJson("94768", "Sydney - Observatory Hill", [
      {
        local: "20261029150000",
        air_temp: 22.2,
        rel_hum: 54,
        press_msl: 1022.4,
        wind_dir: "ESE",
      },
      { local: "20261030090000", air_temp: 20.1, rel_hum: 62, wind_dir: "NNE" },
    ]),
  }),
  forecast: Buffer.from(fixture("IDN11060.xml")),
});

const readingsHeader = ["date", ...Object.keys(readingSchema)].join(",");

/** A line of a saved readings file, with blanks for the columns not given. */
function readingsLine(
  date: string,
  values: Partial<Record<keyof typeof readingSchema, number | string>>,
): string {
  const cells = Object.keys(readingSchema).map((column) =>
    String(values[column as keyof typeof readingSchema] ?? ""),
  );
  return [date, ...cells].join(",");
}

const readingsFile = (...lines: string[]) =>
  [readingsHeader, ...lines, ""].join("\n");

const afternoon = feedsAt("2026-10-30T03:30:00+00:00");
const evening = feedsAt("2026-10-30T11:00:00+00:00");

describe("updateSnapshot", () => {
  let dir: string;
  let snapshotDir: string;
  let readingsDir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "snapshots-"));
    snapshotDir = join(dir, "snapshots");
    readingsDir = join(dir, "readings");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true });
  });

  const update = (feeds: LiveFeeds, historyEnd = "2026-10-20") =>
    updateSnapshot({
      feeds,
      snapshotDir,
      readingsDir,
      location: observatoryHill,
      historyEnd,
    });

  const saved = (folder: string) =>
    readFile(join(folder, "066214.csv"), "utf8");

  test("saves the closed observations and the readings in readable CSVs", async () => {
    const snapshot = await update(evening);

    expect(await saved(snapshotDir)).toBe(
      "date,rain,maxTemp,minTemp\n2026-10-30,0,23.9,16.8\n",
    );
    expect(await saved(readingsDir)).toBe(
      readingsFile(
        "2026-10-29,,,,,,,,,22.2,54,,1022.4,,ESE,,",
        "2026-10-30,20.1,62,,,,NNE,,,,,,,,,,",
      ),
    );
    expect(snapshot.observations).toEqual([
      {
        date: "2026-10-30",
        rain: 0,
        maxTemp: 23.9,
        minTemp: 16.8,
        station: "066214",
      },
    ]);
    expect(snapshot.readings).toHaveLength(2);
  });

  test("gives the same result when run twice", async () => {
    const first = await update(evening);
    const files = [await saved(snapshotDir), await saved(readingsDir)];

    expect(await update(evening)).toEqual(first);
    expect([await saved(snapshotDir), await saved(readingsDir)]).toEqual(files);
  });

  test("keeps a saved maximum when a later run sees its window still open", async () => {
    await update(evening);
    await update(afternoon);

    expect(await saved(snapshotDir)).toBe(
      "date,rain,maxTemp,minTemp\n2026-10-30,0,23.9,16.8\n",
    );
  });

  test("keeps saved readings the latest file no longer has", async () => {
    await mkdir(readingsDir);
    await writeFile(
      join(readingsDir, "066214.csv"),
      readingsFile(
        readingsLine("2026-10-01", { temp9am: 15.2, windDir3pm: "CALM" }),
        readingsLine("2026-10-29", { temp9am: 17.9, windDir9am: "W" }),
      ),
    );

    await update(evening);

    expect(await saved(readingsDir)).toBe(
      readingsFile(
        readingsLine("2026-10-01", { temp9am: 15.2, windDir3pm: "CALM" }),
        readingsLine("2026-10-29", {
          temp9am: 17.9,
          windDir9am: "W",
          temp3pm: 22.2,
          relHum3pm: 54,
          pressure3pm: 1022.4,
          windDir3pm: "ESE",
        }),
        readingsLine("2026-10-30", {
          temp9am: 20.1,
          relHum9am: 62,
          windDir9am: "NNE",
        }),
      ),
    );
  });

  test("prunes the observations the history covers, but never the readings", async () => {
    await update(evening);

    await update(afternoon, "2026-10-30");

    expect(await readdir(snapshotDir)).toEqual([]);
    expect(await saved(readingsDir)).toContain("2026-10-29,");
  });
});

describe("downloadLiveFeeds", () => {
  test("fails when a feed is missing", async () => {
    const ftp: Ftp = {
      download: (path) =>
        Promise.resolve(path.endsWith(".tgz") ? undefined : new Uint8Array()),
      close: () => undefined,
    };

    await expect(downloadLiveFeeds(ftp)).rejects.toThrow(
      "ftp://ftp.bom.gov.au/anon/gen/fwo/IDN60910.tgz does not exist",
    );
  });
});
