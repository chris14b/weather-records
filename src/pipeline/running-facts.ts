import { isForecastStatus, type Direction } from "../shared/facts.ts";
import type { CandidateFact } from "./candidates.ts";
import type { RecentDay } from "./daily-files.ts";
import { beats, generateDailyFacts } from "./daily-facts.ts";
import type { RunningMeasure, RunningValue } from "./observations.ts";
import type { Series } from "./series.ts";
import type { FromStation } from "./stations.ts";

/** A running maximum or rain total can only rise, and a running minimum only fall. */
const settledWay: Record<RunningMeasure, Direction> = {
  maxTemp: "highest",
  minTemp: "lowest",
  rain: "highest",
};

/** The saved live observations without the values still running, such as the maximum from 4pm. */
export function withoutRunning(
  days: readonly FromStation<RecentDay>[],
  running: readonly RunningValue[],
): FromStation<RecentDay>[] {
  return days.map((day) =>
    running
      .filter(({ date }) => date === day.date)
      .reduce((settled, { measure }) => ({ ...settled, [measure]: null }), day),
  );
}

export interface RunningFactsRequest {
  locationId: string;
  /** The settled series, without the running values. */
  series: readonly Series[];
  running: readonly RunningValue[];
}

/**
 * Ranks each running value as its day's, only the way the day can't undo: the hottest
 * so far stays at least that hot, but may not stay the coolest.
 */
export function generateRunningFacts({
  locationId,
  series,
  running,
}: RunningFactsRequest): CandidateFact[] {
  return running.flatMap(({ measure, date, value, observedAt }) => {
    const source = series.find((candidate) => candidate.measure === measure);
    if (source === undefined) return [];
    const extended: Series = {
      ...source,
      days: [
        ...source.days.filter((day) => day.date < date),
        { date, value, status: "partial" },
      ],
    };
    return generateDailyFacts({
      locationId,
      series: [extended],
      windowEnd: date,
      windowDays: 1,
    })
      .filter((fact) => fact.direction === settledWay[measure])
      .map((fact) => ({ ...fact, observedAt }));
  });
}

/**
 * Leaves out the forecast and conditional facts about a running value's day that it has
 * settled: a forecast it has reached, a value it has already passed, and one it has put out
 * of reach.
 */
export function withoutOvertaken(
  facts: readonly CandidateFact[],
  running: readonly RunningValue[],
): CandidateFact[] {
  return facts.filter((fact) => {
    if (!isForecastStatus(fact.status) || fact.period.kind !== "day") {
      return true;
    }
    const current = running.find(
      ({ measure, date }) => measure === fact.measure && date === fact.date,
    );
    if (current === undefined) return true;
    const way = settledWay[current.measure];
    if (fact.status === "forecast" || fact.direction === way) {
      return beats(fact.value, current.value, way);
    }
    return !beats(current.value, fact.value, way);
  });
}
