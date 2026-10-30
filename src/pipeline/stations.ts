import type { Location, StationPeriod } from "../shared/locations.ts";
import { isValidDate } from "./dates.ts";
import { type DailyRecord, loadHistory, type Measure } from "./history.ts";

export type FromStation<T> = T & { station: string };

/** Loads a location's history for a measure, joining its stations by cutover date. */
export async function loadLocationHistory(
  rawDir: string,
  location: Location,
  measure: Measure,
): Promise<FromStation<DailyRecord>[]> {
  const histories = new Map(
    await Promise.all(
      location.stations.map(
        async ({ station }) =>
          [station, await loadHistory(rawDir, station, measure)] as const,
      ),
    ),
  );
  return joinStations(location.stations, histories);
}

/**
 * Takes each station's records for its own period only, so a gap at one station is never
 * filled from another. Each station's records must be in date order.
 */
export function joinStations<T extends { date: string }>(
  stations: readonly StationPeriod[],
  histories: ReadonlyMap<string, readonly T[]>,
): FromStation<T>[] {
  checkPeriods(stations);
  return stations.flatMap(({ station, from = "" }, index) => {
    const records = histories.get(station);
    if (records === undefined) {
      throw new Error(`No history for station ${station}`);
    }
    const until = stations[index + 1]?.from;
    return records
      .filter(
        ({ date }) => date >= from && (until === undefined || date < until),
      )
      .map((record) => ({ ...record, station }));
  });
}

function checkPeriods(stations: readonly StationPeriod[]): void {
  const [first, ...later] = stations;
  if (first === undefined) throw new Error("A location needs a station");
  if (first.from !== undefined) {
    throw new Error(
      `The first station, ${first.station}, must not have a from date`,
    );
  }
  let previous = "";
  for (const { station, from } of later) {
    if (from === undefined || !isValidDate(from)) {
      throw new Error(
        `Station ${station} needs a from date as YYYY-MM-DD, found ${from ?? "none"}`,
      );
    }
    if (from <= previous) {
      throw new Error(
        `Station ${station} starts on ${from}, not after ${previous}`,
      );
    }
    previous = from;
  }
}
