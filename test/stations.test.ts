import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { type Location, locations } from "../src/shared/locations.ts";
import { joinStations, loadLocationHistory } from "../src/pipeline/stations.ts";

const rawDir = join(import.meta.dirname, "..", "data", "raw");

function locationById(id: string): Location {
  const location = locations.find((l) => l.id === id);
  if (location === undefined) throw new Error(`No location ${id}`);
  return location;
}

function days(...dates: string[]): { date: string }[] {
  return dates.map((date) => ({ date }));
}

describe("loadLocationHistory with the real files", () => {
  const observatoryHill = locationById("sydney-observatory-hill");

  test("switches Observatory Hill stations on 2020-09-01", async () => {
    const records = await loadLocationHistory(
      rawDir,
      observatoryHill,
      "minTemp",
    );

    expect(
      records.filter((r) => r.date >= "2020-08-31" && r.date <= "2020-09-01"),
    ).toMatchObject([
      { date: "2020-08-31", station: "066062", value: 12.7 },
      { date: "2020-09-01", station: "066214", value: 10.4 },
    ]);
  });

  test("leaves the old station's missing last max missing", async () => {
    const records = await loadLocationHistory(
      rawDir,
      observatoryHill,
      "maxTemp",
    );

    expect(
      records.filter((r) => r.date >= "2020-08-30" && r.date <= "2020-09-01"),
    ).toMatchObject([
      { date: "2020-08-30", station: "066062" },
      { date: "2020-09-01", station: "066214" },
    ]);
  });

  test.each(locations.map((l) => [l.id, l] as const))(
    "loads %s as one series in date order",
    async (_, location) => {
      const records = await loadLocationHistory(rawDir, location, "rain");
      const dates = records.map((r) => r.date);

      expect(dates.length).toBeGreaterThan(0);
      expect(dates).toEqual([...new Set(dates)].sort());
    },
  );
});

describe("joinStations", () => {
  const cutover = [
    { station: "A" },
    { station: "B", from: "2020-09-01" },
    { station: "C", from: "2021-01-01" },
  ];

  test("takes each station's records for its own period only", () => {
    const histories = new Map([
      ["A", days("2020-08-30", "2020-08-31", "2020-09-01")],
      ["B", days("2020-08-31", "2020-09-01", "2020-12-31", "2021-01-01")],
      ["C", days("2020-12-31", "2021-01-01")],
    ]);

    expect(joinStations(cutover, histories)).toEqual([
      { date: "2020-08-30", station: "A" },
      { date: "2020-08-31", station: "A" },
      { date: "2020-09-01", station: "B" },
      { date: "2020-12-31", station: "B" },
      { date: "2021-01-01", station: "C" },
    ]);
  });

  test("does not fill a gap from another station", () => {
    const histories = new Map([
      ["A", days("2020-08-30")],
      ["B", days("2020-08-31", "2020-09-02")],
      ["C", days("2020-12-31", "2021-01-02")],
    ]);

    expect(joinStations(cutover, histories)).toEqual([
      { date: "2020-08-30", station: "A" },
      { date: "2020-09-02", station: "B" },
      { date: "2021-01-02", station: "C" },
    ]);
  });

  test("keeps the rest of each record", () => {
    const histories = new Map([["A", [{ date: "2000-01-01", value: 3.2 }]]]);

    expect(joinStations([{ station: "A" }], histories)).toEqual([
      { date: "2000-01-01", value: 3.2, station: "A" },
    ]);
  });

  test("fails when a station has no history", () => {
    expect(() =>
      joinStations(cutover, new Map([["A", days("2000-01-01")]])),
    ).toThrow("No history for station B");
  });

  test.each([
    ["no stations", [], "A location needs a station"],
    [
      "a from date on the first station",
      [{ station: "A", from: "2000-01-01" }],
      "The first station, A, must not have a from date",
    ],
    [
      "no from date on a later station",
      [{ station: "A" }, { station: "B" }],
      "Station B needs a from date as YYYY-MM-DD, found none",
    ],
    [
      "a badly formed from date",
      [{ station: "A" }, { station: "B", from: "2020-9-01" }],
      "Station B needs a from date as YYYY-MM-DD, found 2020-9-01",
    ],
    [
      "from dates out of order",
      [
        { station: "A" },
        { station: "B", from: "2020-09-01" },
        { station: "C", from: "2020-09-01" },
      ],
      "Station C starts on 2020-09-01, not after 2020-09-01",
    ],
  ])("fails on %s", (_, stations, message) => {
    expect(() => joinStations(stations, new Map())).toThrow(message);
  });
});
