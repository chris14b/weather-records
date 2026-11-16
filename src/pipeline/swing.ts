import type { ChangingMeasure, TemperatureSwing } from "../shared/facts.ts";
import { addDays, sydneyDate, sydneyHour } from "./dates.ts";
import type { ForecastDay } from "./forecast.ts";
import {
  maxWindowOpensHour,
  minWindowOpensHour,
  type RunningValue,
} from "./observations.ts";
import type { Series } from "./series.ts";

export interface SwingRequest {
  now: Date;
  forecast: readonly ForecastDay[];
  /** The settled series, without the running values. */
  series: readonly Series[];
  running: readonly RunningValue[];
}

/**
 * The day's rise while its maximum's window is open before the night's opens, from 6am to
 * 6pm, and the night's fall otherwise. BOM's afternoon issue drops today's maximum, so the
 * day's last runs have no forecast.
 */
export function temperatureSwing({
  now,
  forecast,
  series,
  running,
}: SwingRequest): TemperatureSwing {
  const today = sydneyDate(now);
  const hour = sydneyHour(now);
  const forecastFor = (date: string) =>
    forecast.find((day) => day.date === date);
  const value = (measure: ChangingMeasure, date: string) =>
    running.find((read) => read.measure === measure && read.date === date)
      ?.value ??
    series
      .find((candidate) => candidate.measure === measure)
      ?.days.find((day) => day.date === date)?.value ??
    null;

  if (hour >= maxWindowOpensHour && hour < minWindowOpensHour) {
    return {
      measure: "maxTemp",
      date: today,
      from: value("minTemp", today),
      current: value("maxTemp", today),
      forecast: forecastFor(today)?.maxTemp ?? null,
    };
  }
  const night = hour < maxWindowOpensHour ? today : addDays(today, 1);
  return {
    measure: "minTemp",
    date: night,
    from: value("maxTemp", addDays(night, -1)),
    current: value("minTemp", night),
    forecast: forecastFor(night)?.minTemp ?? null,
  };
}
