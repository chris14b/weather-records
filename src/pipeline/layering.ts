import type { RecentDay } from "./daily-files.ts";
import { addDays } from "./dates.ts";
import type { DailyRecord, Measure } from "./history.ts";
import type { FromStation } from "./stations.ts";

export type Source = "zip" | "ftp" | "snapshot";

export type LayeredRecord = FromStation<DailyRecord> & { source: Source };

export interface RecentLayer {
  source: Exclude<Source, "zip">;
  days: readonly FromStation<RecentDay>[];
}

/**
 * Lays recent data over a measure's ZIP history. The history alone covers every date up
 * to its last record, so a day it is missing stays missing. After that, each day's value
 * comes from the first layer that has one, so pass the layers in priority order.
 */
export function layerRecent(
  measure: Measure,
  history: readonly FromStation<DailyRecord>[],
  layers: readonly RecentLayer[],
): LayeredRecord[] {
  const last = history.at(-1);
  if (last === undefined) {
    throw new Error(`There is no ${measure} history to lay recent data over`);
  }
  const historyEnd = last.date;

  const recentDates = [
    ...new Set(
      layers.flatMap(({ days }) =>
        days.map(({ date }) => date).filter((date) => date > historyEnd),
      ),
    ),
  ].sort();
  checkNoGap(
    `${measure} at station ${last.station}`,
    historyEnd,
    recentDates[0],
  );

  const byDate = layers.map(
    ({ source, days }) =>
      [source, new Map(days.map((day) => [day.date, day]))] as const,
  );
  const recent = recentDates.flatMap((date): LayeredRecord[] => {
    for (const [source, days] of byDate) {
      const day = days.get(date);
      const value = day?.[measure];
      if (day !== undefined && value !== null && value !== undefined) {
        return [
          {
            date,
            measure,
            value,
            periodDays: 1,
            quality: null,
            station: day.station,
            source,
          },
        ];
      }
    }
    return [];
  });

  return [
    ...history.map((record) => ({ ...record, source: "zip" as const })),
    ...recent,
  ];
}

function checkNoGap(
  series: string,
  historyEnd: string,
  firstRecent: string | undefined,
): void {
  if (firstRecent !== undefined && firstRecent !== addDays(historyEnd, 1)) {
    throw new Error(
      `Gap in ${series}: the ZIP history ends on ${historyEnd}, but the recent data starts on ${firstRecent}`,
    );
  }
}
