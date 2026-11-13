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

const [observatoryHill, airport] = locations as [Location, Location];

const feedsAt = (observationsUtc: string): LiveFeeds => ({
  observations: Buffer.from(observationsAt(observationsUtc)),
  readings: readingsArchive({
    "IDN60910.94768.json": readingsJson("94768", "Sydney - Observatory Hill", [
      { local: "20261029150000", air_temp: 22.2, rel_hum: 54 },
      { local: "20261030090000", air_temp: 20.1, rel_hum: 62 },
    ]),
    "IDN60910.94767.json": readingsJson("94767", "Sydney Airport", [
      { local: "20261030090000", air_temp: 19.4, rel_hum: 70 },
    ]),
  }),
  forecast: Buffer.from(fixture("IDN11060.xml")),
});

const readingsHeader = ["date", ...Object.keys(readingSchema)].join(",");

/** A line of a saved readings file, with blanks for the columns not given. */
function readingsLine(
  date: string,
  values: Partial<Record<keyof typeof readingSchema, number>>,
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
  let gustsDir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "snapshots-"));
    snapshotDir = join(dir, "snapshots");
    readingsDir = join(dir, "readings");
    gustsDir = join(dir, "gusts");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true });
  });

  const update = (
    feeds: LiveFeeds,
    historyEnd = "2026-10-20",
    today = "2026-10-30",
    location = observatoryHill,
  ) =>
    updateSnapshot({
      feeds,
      snapshotDir,
      readingsDir,
      gustsDir,
      location,
      historyEnd,
      today,
    });

  const saved = (folder: string) =>
    readFile(join(folder, "066214.csv"), "utf8");

  test("saves the closed observations and the readings in readable CSVs", async () => {
    const snapshot = await update(evening);

    expect(await saved(snapshotDir)).toBe(
      "date,rain,maxTemp,minTemp\n2026-10-30,0,23.9,16.8\n",
    );
    expect(await saved(readingsDir)).toBe(
      readingsFile("2026-10-29,,,22.2,54", "2026-10-30,20.1,62,,"),
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
        readingsLine("2026-10-01", { temp9am: 15.2, relHum3pm: 48 }),
        readingsLine("2026-10-29", { temp9am: 17.9, relHum9am: 70 }),
      ),
    );

    await update(evening);

    expect(await saved(readingsDir)).toBe(
      readingsFile(
        readingsLine("2026-10-01", { temp9am: 15.2, relHum3pm: 48 }),
        readingsLine("2026-10-29", {
          temp9am: 17.9,
          relHum9am: 70,
          temp3pm: 22.2,
          relHum3pm: 54,
        }),
        readingsLine("2026-10-30", { temp9am: 20.1, relHum9am: 62 }),
      ),
    );
  });

  test("prunes the observations the history covers, but not the readings", async () => {
    await update(evening);

    await update(afternoon, "2026-10-30");

    expect(await readdir(snapshotDir)).toEqual([]);
    expect(await saved(readingsDir)).toContain("2026-10-29,");
  });

  test("prunes readings from before the same month a year ago", async () => {
    await mkdir(readingsDir);
    await writeFile(
      join(readingsDir, "066214.csv"),
      readingsFile(
        readingsLine("2025-09-30", { temp9am: 14.8 }),
        readingsLine("2025-10-01", { temp9am: 15.6 }),
      ),
    );

    const snapshot = await update(evening);

    expect(snapshot.readings.map(({ date }) => date)).toEqual([
      "2025-10-01",
      "2026-10-29",
      "2026-10-30",
    ]);
    expect(await saved(readingsDir)).not.toContain("2025-09-30");
  });

  describe("gusts", () => {
    const savedGusts = () => readFile(join(gustsDir, "066037.csv"), "utf8");
    const gustsAt = (utc: string, feedGust: number): LiveFeeds => ({
      ...feedsAt(utc),
      observations: Buffer.from(
        observationsAt(utc).replace(
          'type="maximum_gust_kmh" instance="running" time-utc="2026-10-30T02:47:00+00:00" time-local="2026-10-30T13:47:00+11:00">44<',
          `type="maximum_gust_kmh" instance="running" time-utc="2026-10-30T02:47:00+00:00" time-local="2026-10-30T13:47:00+11:00">${String(feedGust)}<`,
        ),
      ),
    });
    const updateAirport = (feeds: LiveFeeds, today = "2026-10-30") =>
      update(feeds, "2026-10-20", today, airport);

    test("saves today's gust so far, which a later run replaces", async () => {
      await updateAirport(gustsAt("2026-10-30T03:30:00+00:00", 44));
      const snapshot = await updateAirport(
        gustsAt("2026-10-30T09:30:00+00:00", 61),
      );

      expect(await savedGusts()).toBe(
        "date,feedGust,dwoGust\n2026-10-30,61,\n",
      );
      expect(snapshot.gusts).toEqual([
        { date: "2026-10-30", feedGust: 61, dwoGust: null, station: "066037" },
      ]);
    });

    test("keeps the DWO's gust for a day", async () => {
      await mkdir(gustsDir);
      await writeFile(
        join(gustsDir, "066037.csv"),
        "date,feedGust,dwoGust\n2026-10-29,52,57\n",
      );

      await updateAirport(afternoon);

      expect(await savedGusts()).toBe(
        "date,feedGust,dwoGust\n2026-10-29,52,57\n2026-10-30,44,\n",
      );
    });

    test("prunes gusts from before the same month a year ago", async () => {
      await mkdir(gustsDir);
      await writeFile(
        join(gustsDir, "066037.csv"),
        "date,feedGust,dwoGust\n2025-09-30,40,41\n2025-10-01,42,43\n",
      );

      await updateAirport(afternoon);

      expect(await savedGusts()).not.toContain("2025-09-30");
      expect(await savedGusts()).toContain("2025-10-01");
    });

    test("saves none for Observatory Hill, which has no anemometer", async () => {
      const snapshot = await update(evening);

      expect(snapshot.gusts).toEqual([]);
      await expect(readdir(gustsDir)).rejects.toThrow("ENOENT");
    });
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
