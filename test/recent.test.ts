import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { Location, Station } from "../src/shared/locations.ts";
import type { RecentDay } from "../src/pipeline/daily-files.ts";
import { readSavedDays, updateDailyFiles } from "../src/pipeline/recent.ts";
import { daysFrom, FakeFtp, repeatedDays } from "./daily-file.ts";

const oldStation: Station = {
  station: "OLD",
  name: "OLD STATION",
  dailyFolder: { name: "old_station", from: "2009-01" },
};
const newStation: Station = {
  station: "NEW",
  name: "NEW STATION AWS (TEST)",
  dailyFolder: { name: "new_station_(test)", from: "2009-01" },
  from: "2026-09-15",
};
const namesInFiles = new Map([
  [oldStation, "OLD STATION"],
  [newStation, "NEW STATION (TEST)"],
]);

const location: Location = {
  id: "test",
  name: "Test",
  forecastArea: { aac: "NSW_PT000", description: "Test" },
  latitude: 0,
  longitude: 0,
  stations: [oldStation, newStation],
};

class DailyFtp extends FakeFtp {
  override serve(
    station: Station,
    month: string,
    days: readonly RecentDay[],
  ): void {
    super.serve(station, month, days, namesInFiles.get(station));
  }
}

describe("updateDailyFiles", () => {
  let dir: string;
  let ftp: DailyFtp;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "recent-"));
    ftp = new DailyFtp();
  });

  afterEach(async () => {
    await rm(dir, { recursive: true });
  });

  const update = (historyEnd: string, today: string) =>
    updateDailyFiles({ ftp, dir, location, historyEnd, today });

  const savedFile = (station: string) =>
    readFile(join(dir, `${station}.csv`), "utf8");

  test("saves each station's days after the history ends, in a readable CSV", async () => {
    ftp.serve(
      oldStation,
      "2026-09",
      repeatedDays("2026-09-01", 30, [0.2, 20, 10]),
    );
    ftp.serve(
      newStation,
      "2026-09",
      repeatedDays("2026-09-01", 30, [0.4, 21, 11]),
    );
    ftp.serve(
      newStation,
      "2026-10",
      daysFrom("2026-10-01", [83.4, null, 13.2], [null, 17.6, null]),
    );

    const days = await update("2026-09-12", "2026-10-03");

    expect(ftp.requested).toEqual([
      "old_station-202609.csv",
      "new_station_(test)-202609.csv",
      "new_station_(test)-202610.csv",
    ]);
    expect(await savedFile("OLD")).toBe(
      "date,rain,maxTemp,minTemp\n" +
        "2026-09-13,0.2,20,10\n" +
        "2026-09-14,0.2,20,10\n",
    );
    expect((await savedFile("NEW")).split("\n").slice(-4)).toEqual([
      "2026-09-30,0.4,21,11",
      "2026-10-01,83.4,,13.2",
      "2026-10-02,,17.6,",
      "",
    ]);
    expect(days.map((d) => [d.date, d.station])).toContainEqual([
      "2026-09-15",
      "NEW",
    ]);
    expect(days).toHaveLength(20);
  });

  test("fetches from the month of the first day it doesn't have, from stations still in use", async () => {
    await writeFile(
      join(dir, "NEW.csv"),
      "date,rain,maxTemp,minTemp\n2026-09-29,1,20,10\n",
    );
    ftp.serve(
      newStation,
      "2026-09",
      repeatedDays("2026-09-01", 30, [5, 25, 15]),
    );
    ftp.serve(newStation, "2026-11", daysFrom("2026-11-01", [0, 30, 20]));
    ftp.serve(newStation, "2026-10", daysFrom("2026-10-01", [0, 22, 12]));

    await update("2026-09-20", "2026-11-02");

    expect(ftp.requested).toEqual([
      "new_station_(test)-202609.csv",
      "new_station_(test)-202610.csv",
      "new_station_(test)-202611.csv",
    ]);
  });

  test("replaces the saved copies of the months it fetches", async () => {
    await writeFile(
      join(dir, "NEW.csv"),
      "date,rain,maxTemp,minTemp\n2026-09-29,1,20,10\n2026-10-01,9,9,9\n",
    );
    ftp.serve(
      newStation,
      "2026-10",
      daysFrom("2026-10-01", [0, 22, 12], [0, 23, 13]),
    );

    await update("2026-09-20", "2026-10-03");

    expect(await readSavedDays(dir, "NEW")).toEqual([
      { date: "2026-09-29", rain: 1, maxTemp: 20, minTemp: 10 },
      ...daysFrom("2026-10-01", [0, 22, 12], [0, 23, 13]),
    ]);
  });

  test("prunes the days the history now covers, deleting emptied files", async () => {
    await writeFile(
      join(dir, "OLD.csv"),
      "date,rain,maxTemp,minTemp\n2026-09-13,1,20,10\n",
    );
    await writeFile(
      join(dir, "NEW.csv"),
      "date,rain,maxTemp,minTemp\n2026-09-29,1,20,10\n2026-09-30,2,21,11\n",
    );

    await update("2026-09-29", "2026-09-30");

    expect(await readdir(dir)).toEqual(["NEW.csv"]);
    expect(await readSavedDays(dir, "NEW")).toEqual([
      { date: "2026-09-30", rain: 2, maxTemp: 21, minTemp: 11 },
    ]);
  });

  test("gives the same result when run twice", async () => {
    ftp.serve(
      newStation,
      "2026-10",
      daysFrom("2026-10-01", [0, 22, 12], [1, 23, 13]),
    );

    const first = await update("2026-09-30", "2026-10-03");
    const firstFile = await savedFile("NEW");
    const second = await update("2026-09-30", "2026-10-03");

    expect(second).toEqual(first);
    expect(await savedFile("NEW")).toBe(firstFile);
  });

  test("accepts a current month that isn't published yet", async () => {
    ftp.serve(
      newStation,
      "2026-10",
      repeatedDays("2026-10-01", 31, [0, 22, 12]),
    );

    const days = await update("2026-10-30", "2026-11-01");

    expect(days.map((d) => d.date)).toEqual(["2026-10-31"]);
  });

  test("fails when an earlier month is missing", async () => {
    ftp.serve(newStation, "2026-11", daysFrom("2026-11-01", [0, 22, 12]));

    await expect(update("2026-10-30", "2026-11-02")).rejects.toThrow(
      "new_station_(test)-202610.csv does not exist",
    );
  });

  test("fails when a saved file's headers have changed", async () => {
    await writeFile(join(dir, "NEW.csv"), "date,rain,max,min\n");

    await expect(update("2026-09-30", "2026-10-03")).rejects.toThrow(
      "NEW.csv has unexpected column headers",
    );
  });

  test.each([
    ["a bad date", "2026-02-30,1,2,3", "line 2: invalid date 2026-02-30"],
    ["a bad value", "2026-10-01,1,hot,3", "line 2: invalid value hot"],
    [
      "a missing column",
      "2026-10-01,1,2",
      "line 2: expected 4 columns, found 3",
    ],
  ])("fails when a saved file has %s", async (_, row, message) => {
    await writeFile(
      join(dir, "NEW.csv"),
      `date,rain,maxTemp,minTemp\n${row}\n`,
    );

    await expect(readSavedDays(dir, "NEW")).rejects.toThrow(message);
  });

  test("fails when a saved file's dates are out of order", async () => {
    await writeFile(
      join(dir, "NEW.csv"),
      "date,rain,maxTemp,minTemp\n2026-10-02,1,2,3\n2026-10-01,1,2,3\n",
    );

    await expect(readSavedDays(dir, "NEW")).rejects.toThrow(
      "line 3: 2026-10-01 is not after 2026-10-02",
    );
  });
});
