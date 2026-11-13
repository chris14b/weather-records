import type { RunningValue } from "./observations.ts";
import { mergeRows, type SavedRow } from "./saved-table.ts";

/**
 * A day's strongest gust, in km/h: as the runs saw it, which is only the strongest so far,
 * and as the Daily Weather Observations give it for the whole day.
 */
export const gustSchema = { feedGust: "number", dwoGust: "number" } as const;

export type SavedGust = SavedRow<typeof gustSchema>;

/** The day's gust so far from the live feed, which each later run that day replaces. */
export function feedGusts(running: readonly RunningValue[]): SavedGust[] {
  return running
    .filter(({ measure }) => measure === "gust")
    .map(({ date, value }) => ({ date, feedGust: value, dwoGust: null }));
}

/** The saved gusts without the run's value for a day still running, which is ranked as running instead. */
export function withoutRunningGust(
  rows: readonly SavedGust[],
  running: readonly RunningValue[],
): SavedGust[] {
  const runningDates = new Set(
    running.filter(({ measure }) => measure === "gust").map(({ date }) => date),
  );
  return rows.map((row) =>
    runningDates.has(row.date) ? { ...row, feedGust: null } : row,
  );
}

export interface DwoGust {
  date: string;
  gust: number | null;
}

/**
 * Lays the Daily Weather Observations' gusts over the saved ones, keeping only dates from
 * `keptFrom`. Today's is left out, since it is only the gust so far. A blank DWO gust leaves
 * the saved one alone.
 */
export function addDwoGusts(
  saved: readonly SavedGust[],
  dwo: readonly DwoGust[],
  keptFrom: string,
  today: string,
): SavedGust[] {
  const fresh = dwo
    .filter(({ date }) => date >= keptFrom && date < today)
    .map(({ date, gust }) => ({ date, feedGust: null, dwoGust: gust }));
  return mergeRows(gustSchema, saved, fresh).filter(
    ({ date }) => date >= keptFrom,
  );
}
