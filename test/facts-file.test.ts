import { readFileSync } from "node:fs";
import { cp, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { FactsFile } from "../src/shared/facts.ts";
import { locationById } from "../src/shared/locations.ts";
import { dailyFilePath } from "../src/pipeline/daily-files.ts";
import { buildFactsFile, writeFactsFile } from "../src/pipeline/facts-file.ts";
import { forecastPath } from "../src/pipeline/forecast.ts";
import { observationsPath } from "../src/pipeline/observations.ts";
import { readingsArchivePath } from "../src/pipeline/readings.ts";
import { type DataDirs, dataDirs } from "../src/pipeline/saved-series.ts";
import { FakeFtp } from "./daily-file.ts";
import { fixture, readingsArchive } from "./live-feeds.ts";

const observatoryHill = locationById("sydney-observatory-hill");
const [, station066214] = observatoryHill.stations;

/** When the live feed fixtures were issued: 2:30pm on 2026-10-30. */
const now = new Date("2026-10-30T03:30:00Z");

/** Serves the fixtures, except any of the paths given. */
function fakeBom(...missing: string[]): FakeFtp {
  const ftp = new FakeFtp();
  if (station066214 === undefined) throw new Error("No station 066214");
  ftp.serveFile(
    dailyFilePath({ station: station066214, month: "2026-10" }),
    readFileSync(
      join(
        import.meta.dirname,
        "fixtures",
        "sydney_(observatory_hill)-202610.csv",
      ),
    ),
  );
  ftp.serveFile(observationsPath, Buffer.from(fixture("IDN60920.xml")));
  ftp.serveFile(
    readingsArchivePath,
    readingsArchive({
      "IDN60910.94768.json": fixture("IDN60910.94768.json"),
    }),
  );
  ftp.serveFile(forecastPath, Buffer.from(fixture("IDN11060.xml")));
  for (const path of missing) ftp.remove(path);
  return ftp;
}

async function savedFiles(dir: string): Promise<Record<string, string>> {
  const names = await readdir(dir, { recursive: true, withFileTypes: true });
  const files = names.filter((entry) => entry.isFile());
  return Object.fromEntries(
    await Promise.all(
      files.map(async (entry) => {
        const path = join(entry.parentPath, entry.name);
        return [relative(dir, path), await readFile(path, "utf8")] as const;
      }),
    ),
  );
}

let root: string;
let dirs: DataDirs;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "facts-file-"));
  dirs = {
    raw: dataDirs.raw,
    daily: join(root, "recent/daily"),
    snapshots: join(root, "recent/snapshots"),
    readings: join(root, "recent/readings"),
    ftpHistory: join(root, "ftp-history"),
  };
  await cp(dataDirs.ftpHistory, dirs.ftpHistory, { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("buildFactsFile", () => {
  const build = () =>
    buildFactsFile({
      ftp: fakeBom(),
      now,
      locations: [observatoryHill],
      dirs,
    });

  test("chooses facts from the saved and fetched data, as of the run", async () => {
    const file = await build();

    expect(file.generatedAt).toBe("2026-10-30T03:30:00.000Z");
    expect(file.locations.map(({ locationId }) => locationId)).toEqual([
      "sydney-observatory-hill",
    ]);
    const [facts] = file.locations;
    expect(new Set(facts?.today.map(({ date }) => date))).toEqual(
      new Set(["2026-10-30"]),
    );
    expect(facts?.comingWeek.every(({ date }) => date >= "2026-10-30")).toBe(
      true,
    );
    expect(facts?.forecast).toHaveLength(7);
    expect(facts?.forecast[0]).toEqual({
      date: "2026-10-30",
      iconCode: 3,
      precis: "Mostly sunny.",
    });
    expect(Object.keys(await savedFiles(root)).sort()).toEqual([
      "ftp-history/066037.csv",
      "ftp-history/066062.csv",
      "ftp-history/066212.csv",
      "ftp-history/066214.csv",
      "recent/readings/066214.csv",
      "recent/snapshots/066214.csv",
    ]);
  }, 30_000);

  test("gives the same files and facts when run twice", async () => {
    const first = await build();
    const saved = await savedFiles(root);

    expect(await build()).toEqual(first);
    expect(await savedFiles(root)).toEqual(saved);
  }, 30_000);

  test("fails when a live feed is missing", async () => {
    await expect(
      buildFactsFile({
        ftp: fakeBom(forecastPath),
        now,
        locations: [observatoryHill],
        dirs,
      }),
    ).rejects.toThrow("IDN11060.xml does not exist");
  });
});

describe("writeFactsFile", () => {
  test("writes the file as JSON, creating its directory", async () => {
    const file: FactsFile = { generatedAt: now.toISOString(), locations: [] };
    const path = join(root, "public", "facts.json");

    await writeFactsFile(path, file);

    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(file);
    expect(await readdir(join(root, "public"))).toEqual(["facts.json"]);
  });
});
