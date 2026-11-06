import type {
  ChangeMeasure,
  ChangingMeasure,
  FactMeasure,
  ValueStatus,
} from "../shared/facts.ts";
import { addDays } from "./dates.ts";
import type { FtpHistoryDay } from "./ftp-history.ts";
import type { DailyRecord } from "./history.ts";
import type { LayeredRecord } from "./layering.ts";
import type { DailyReadings } from "./readings.ts";

export interface SeriesDay {
  date: string;
  value: number;
  status: ValueStatus;
}

/** A value for several days, such as a rain total over a weekend, from `from` to `date`. */
export interface MultiDayValue extends SeriesDay {
  from: string;
}

/** One measure's single-day values for a location, in date order. */
export interface Series<Measure extends FactMeasure = FactMeasure> {
  measure: Measure;
  days: readonly SeriesDay[];
  /** Values for several days, left out of `days`, in date order. */
  multiDay?: readonly MultiDayValue[];
  /** Whether the values go back to when records began. */
  fullRecord: boolean;
}

/**
 * Keeps a layered ZIP measure's single-day values. Multi-day values are kept apart, so
 * the days they cover are missing from `days`. A value whose period is unknown or zero is
 * left out.
 */
export function layeredSeries<Measure extends FactMeasure>(
  measure: Measure,
  records: readonly LayeredRecord[],
): Series<Measure> {
  const dates = new Set(records.map(({ date }) => date));
  const day = ({ date, value, source }: LayeredRecord): SeriesDay => ({
    date,
    value,
    status: source === "snapshot" ? "provisional" : "confirmed",
  });
  return {
    measure,
    days: records
      .filter(({ date, periodDays }, index) =>
        isSingleDay(periodDays, index === 0 || dates.has(addDays(date, -1))),
      )
      .map(day),
    multiDay: records.flatMap((record) =>
      record.periodDays !== null && record.periodDays > 1
        ? [
            {
              ...day(record),
              from: addDays(record.date, 1 - record.periodDays),
            },
          ]
        : [],
    ),
    fullRecord: true,
  };
}

// Apart from the first day of a record, every blank-period temperature in the ZIPs follows a
// missing day, so it is probably an accumulation. No blank-period rain value does.
function isSingleDay(
  periodDays: DailyRecord["periodDays"],
  followsRecordedDay: boolean,
): boolean {
  return periodDays === null ? followsRecordedDay : periodDays === 1;
}

/** Each day's maximum minus its minimum, on the days that have both. */
export function rangeSeries(max: Series, min: Series): Series<"range"> {
  const mins = new Map(min.days.map((day) => [day.date, day]));
  return {
    measure: "range",
    days: max.days.flatMap(({ date, value, status }) => {
      const low = mins.get(date);
      if (low === undefined) return [];
      return [
        {
          date,
          value: roundedDifference(value, low.value),
          status: combinedStatus(status, low.status),
        },
      ];
    }),
    fullRecord: max.fullRecord && min.fullRecord,
  };
}

/**
 * Each day's value minus the day before's, on the days where both have one. A change is
 * provisional if either value is.
 */
export function changeSeries(
  source: Series<ChangingMeasure>,
): Series<ChangeMeasure> {
  const byDate = new Map(source.days.map((day) => [day.date, day]));
  return {
    measure: `${source.measure}Change`,
    days: source.days.flatMap(({ date, value, status }) => {
      const before = byDate.get(addDays(date, -1));
      if (before === undefined) return [];
      return [
        {
          date,
          value: roundedDifference(value, before.value),
          status: combinedStatus(status, before.status),
        },
      ];
    }),
    fullRecord: source.fullRecord,
  };
}

function roundedDifference(value: number, other: number): number {
  return Math.round((value - other) * 10) / 10;
}

function combinedStatus(...statuses: ValueStatus[]): ValueStatus {
  return statuses.every((status) => status === "confirmed")
    ? "confirmed"
    : "provisional";
}

export interface LocationData {
  rain: readonly LayeredRecord[];
  maxTemp: readonly LayeredRecord[];
  minTemp: readonly LayeredRecord[];
  ftpHistory: readonly FtpHistoryDay[];
  readings: readonly DailyReadings[];
}

/** Every series that facts are made from, for one location. */
export function locationSeries(data: LocationData): Series[] {
  const maxTemp = layeredSeries("maxTemp", data.maxTemp);
  const minTemp = layeredSeries("minTemp", data.minTemp);
  return [
    maxTemp,
    minTemp,
    layeredSeries("rain", data.rain),
    rangeSeries(maxTemp, minTemp),
    columnSeries("maxRelHum", data.ftpHistory),
    columnSeries("minRelHum", data.ftpHistory),
    columnSeries("solar", data.ftpHistory),
    columnSeries("temp9am", data.readings),
    columnSeries("relHum9am", data.readings),
    columnSeries("temp3pm", data.readings),
    columnSeries("relHum3pm", data.readings),
    changeSeries(maxTemp),
    changeSeries(minTemp),
  ];
}

/**
 * Takes one column of saved rows, such as the FTP history or the 9am and 3pm readings,
 * whose history starts after records began.
 */
export function columnSeries<Column extends FactMeasure>(
  measure: Column,
  rows: readonly ({ date: string } & Record<Column, number | null>)[],
): Series<Column> {
  return {
    measure,
    days: rows.flatMap((row) => {
      const value = row[measure];
      return value === null
        ? []
        : [{ date: row.date, value, status: "confirmed" as const }];
    }),
    fullRecord: false,
  };
}
