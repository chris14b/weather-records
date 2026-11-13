import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { Location, Station } from "../src/shared/locations.ts";
import {
  ftpHistorySchema,
  updateFtpHistory,
} from "../src/pipeline/ftp-history.ts";
import { readSavedRows } from "../src/pipeline/saved-table.ts";
import { FakeFtp, historyDaysFrom, type HistoryValues } from "./daily-file.ts";

const oldStation: Station = {
  station: "OLD",
  name: "OLD STATION",
  dailyFolder: {
    name: "old_station",
    from: "2026-06",
    missing: [{ from: "2026-07", to: "2026-07" }],
  },
};
const newStation: Station = {
  station: "NEW",
  name: "NEW STATION",
  dailyFolder: { name: "new_station", from: "2026-01" },
  from: "2026-09-15",
};

const location: Location = {
  id: "test",
  name: "Test",
  forecastArea: { aac: "NSW_PT000", description: "Test" },
  latitude: 0,
  longitude: 0,
  stations: [oldStation, newStation],
};

const day = (
  maxRelHum: number,
  minRelHum: number | null,
  wind: number | null,
  solar: number,
): HistoryValues => ({ maxRelHum, minRelHum, wind, solar });

const month = (first: string, days: number, values: HistoryValues) =>
  historyDaysFrom(first, ...Array.from({ length: days }, () => values));

describe("updateFtpHistory", () => {
  let dir: string;
  let ftp: FakeFtp;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ftp-history-"));
    ftp = new FakeFtp();
    ftp.serve(
      oldStation,
      "2026-06",
      month("2026-06-01", 30, day(90, 40, 5.5, 20)),
    );
    ftp.serve(
      oldStation,
      "2026-08",
      month("2026-08-01", 31, day(91, 41, 6.5, 21)),
    );
    ftp.serve(
      oldStation,
      "2026-09",
      month("2026-09-01", 30, day(92, 42, 7.5, 22)),
    );
    ftp.serve(
      newStation,
      "2026-09",
      month("2026-09-01", 30, day(80, 30, 3.5, 10)),
    );
    ftp.serve(
      newStation,
      "2026-10",
      historyDaysFrom(
        "2026-10-01",
        day(81, null, 4.12, 11.25),
        day(82, 32, null, 12),
      ),
    );
  });

  afterEach(async () => {
    await rm(dir, { recursive: true });
  });

  const update = (today = "2026-10-03") =>
    updateFtpHistory({ ftp, dir, location, today });

  const savedFile = (station: string) =>
    readFile(join(dir, `${station}.csv`), "utf8");

  test("backfills each station's own period from its folder's first month, skipping the months the folder has no file for", async () => {
    const history = await update();

    expect(ftp.requested).toEqual([
      "old_station-202606.csv",
      "old_station-202608.csv",
      "old_station-202609.csv",
      "new_station-202609.csv",
      "new_station-202610.csv",
    ]);
    expect((await savedFile("OLD")).split("\n").slice(0, 2)).toEqual([
      "date,maxRelHum,minRelHum,wind,solar",
      "2026-06-01,90,40,5.5,20",
    ]);
    expect((await savedFile("OLD")).split("\n").slice(-3)).toEqual([
      "2026-09-13,92,42,7.5,22",
      "2026-09-14,92,42,7.5,22",
      "",
    ]);
    expect(await savedFile("NEW")).toMatch(
      /^date,maxRelHum,minRelHum,wind,solar\n2026-09-15,80,30,3.5,10\n.*2026-10-01,81,,4.12,11.25\n2026-10-02,82,32,,12\n$/s,
    );
    expect(history).toHaveLength(30 + 31 + 14 + 16 + 2);
    expect(history.at(-1)).toEqual({
      date: "2026-10-02",
      maxRelHum: 82,
      minRelHum: 32,
      wind: null,
      solar: 12,
      station: "NEW",
    });
  });

  test("carries on from where an interrupted run stopped", async () => {
    ftp.failing.add("old_station-202609.csv");
    await expect(update()).rejects.toThrow("old_station-202609.csv failed");
    expect(
      (await readSavedRows(join(dir, "OLD.csv"), ftpHistorySchema)).at(-1)
        ?.date,
    ).toBe("2026-08-31");

    ftp.failing.clear();
    ftp.requested.length = 0;
    const resumed = await update();
    const resumedFile = await savedFile("OLD");

    expect(ftp.requested).toEqual([
      "old_station-202609.csv",
      "new_station-202609.csv",
      "new_station-202610.csv",
    ]);
    await rm(dir, { recursive: true });
    dir = await mkdtemp(join(tmpdir(), "ftp-history-"));
    expect(await update()).toEqual(resumed);
    expect(await savedFile("OLD")).toBe(resumedFile);
  });

  test("gives the same files when run twice, fetching only the month that isn't complete yet", async () => {
    const first = await update();
    const files = [await savedFile("OLD"), await savedFile("NEW")];
    ftp.requested.length = 0;

    const second = await update();

    expect(ftp.requested).toEqual(["new_station-202610.csv"]);
    expect(second).toEqual(first);
    expect([await savedFile("OLD"), await savedFile("NEW")]).toEqual(files);
  });

  test("replaces the saved days of the months it fetches", async () => {
    await update();
    ftp.serve(
      newStation,
      "2026-10",
      historyDaysFrom(
        "2026-10-01",
        day(81, 31, 4.12, 11.25),
        day(83, 33, 4.5, 13),
        day(84, 34, 5, 14),
      ),
    );

    await update("2026-10-04");

    expect((await savedFile("NEW")).split("\n").slice(-4)).toEqual([
      "2026-10-01,81,31,4.12,11.25",
      "2026-10-02,83,33,4.5,13",
      "2026-10-03,84,34,5,14",
      "",
    ]);
  });

  test("fetches every month after the last saved day, so an outage leaves no gap", async () => {
    await update();
    ftp.serve(
      newStation,
      "2026-10",
      month("2026-10-01", 31, day(85, 35, 3.5, 15)),
    );
    ftp.serve(
      newStation,
      "2026-11",
      month("2026-11-01", 30, day(86, 36, 1.5, 16)),
    );
    ftp.serve(
      newStation,
      "2026-12",
      month("2026-12-01", 2, day(87, 37, 2.5, 17)),
    );
    ftp.requested.length = 0;

    await update("2026-12-03");

    expect(ftp.requested).toEqual([
      "new_station-202610.csv",
      "new_station-202611.csv",
      "new_station-202612.csv",
    ]);
  });

  test("accepts a current month that isn't published yet", async () => {
    ftp.serve(
      newStation,
      "2026-10",
      month("2026-10-01", 31, day(85, 35, 3.5, 15)),
    );

    const history = await update("2026-11-01");

    expect(ftp.requested.at(-1)).toBe("new_station-202611.csv");
    expect(history.at(-1)?.date).toBe("2026-10-31");
  });

  test("fails when an earlier month is missing", async () => {
    await writeFile(
      join(dir, "NEW.csv"),
      "date,maxRelHum,minRelHum,wind,solar\n2026-10-31,80,30,3.5,10\n",
    );

    await expect(update("2026-12-01")).rejects.toThrow(
      "new_station-202611.csv does not exist",
    );
  });
});
