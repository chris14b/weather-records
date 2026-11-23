import type {
  ChangeMeasure,
  ChangingMeasure,
  DayMeasure,
  FactMeasure,
  PeriodOnlyMeasure,
  ValueStatus,
} from "../shared/facts.ts";
import { addDays, daysBetween } from "./dates.ts";
import type { FtpHistoryDay } from "./ftp-history.ts";
import type { SavedGust } from "./gusts.ts";
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
  /** Whether the values are kept for only about a year, so each day is compared with the year before it. */
  pastYear?: true;
  /** Whether only months, seasons and years are ranked on it, not its days. */
  periodsOnly?: true;
}

/** A day with at least this much rain, in mm, is a rain day, as BOM counts them. */
export const rainDayMillimetres = 1;

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

/** The average of two series on each day that has both, such as a day's mean temperature. */
export function averageSeries<Measure extends PeriodOnlyMeasure>(
  measure: Measure,
  a: Series,
  b: Series,
): Series<Measure> {
  const others = new Map(b.days.map((day) => [day.date, day]));
  return {
    measure,
    days: a.days.flatMap(({ date, value, status }) => {
      const other = others.get(date);
      if (other === undefined) return [];
      return [
        {
          date,
          value: (value + other.value) / 2,
          status: combinedStatus(status, other.status),
        },
      ];
    }),
    fullRecord: a.fullRecord && b.fullRecord,
    periodsOnly: true,
  };
}

/**
 * Each day as 1 if it had a rain day's worth of rain, otherwise 0. A multi-day total under
 * that much leaves every day it covers dry, so they count as 0. A larger one says nothing
 * about any one day, so they stay missing.
 */
export function rainDaySeries(rain: Series): Series<"rainDays"> {
  const counted = new Set(rain.days.map(({ date }) => date));
  const dry = (rain.multiDay ?? [])
    .filter(({ value }) => value < rainDayMillimetres)
    .flatMap(({ from, date, status }) =>
      Array.from({ length: daysBetween(from, date) + 1 }, (_, index) =>
        addDays(from, index),
      )
        .filter((day) => !counted.has(day))
        .map((day) => ({ date: day, value: 0, status })),
    );
  return {
    measure: "rainDays",
    days: [
      ...rain.days.map(({ date, value, status }) => ({
        date,
        value: value >= rainDayMillimetres ? 1 : 0,
        status,
      })),
      ...dry,
    ].sort((a, b) => a.date.localeCompare(b.date)),
    fullRecord: rain.fullRecord,
    periodsOnly: true,
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
  gusts: readonly SavedGust[];
}

/** Every series that facts are made from, for one location. */
export function locationSeries(data: LocationData): Series[] {
  const maxTemp = layeredSeries("maxTemp", data.maxTemp);
  const minTemp = layeredSeries("minTemp", data.minTemp);
  const rain = layeredSeries("rain", data.rain);
  const maxRelHum = columnSeries("maxRelHum", data.ftpHistory);
  const minRelHum = columnSeries("minRelHum", data.ftpHistory);
  return [
    maxTemp,
    minTemp,
    rain,
    rangeSeries(maxTemp, minTemp),
    maxRelHum,
    minRelHum,
    windSeries(columnSeries("wind", data.ftpHistory)),
    columnSeries("solar", data.ftpHistory),
    pastYearSeries(columnSeries("temp9am", data.readings)),
    pastYearSeries(columnSeries("relHum9am", data.readings)),
    pastYearSeries(columnSeries("temp3pm", data.readings)),
    pastYearSeries(columnSeries("relHum3pm", data.readings)),
    gustSeries(data.gusts),
    changeSeries(maxTemp),
    changeSeries(minTemp),
    averageSeries("meanTemp", maxTemp, minTemp),
    rainDaySeries(rain),
    averageSeries("meanRelHum", maxRelHum, minRelHum),
  ];
}

/**
 * Takes one column of saved rows, such as the FTP history or the 9am and 3pm readings,
 * whose history starts after records began.
 */
export function columnSeries<Column extends DayMeasure>(
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

/** Turns the daily files' m/s into km/h, to 0.1 km/h, the unit BOM's observations and forecasts use. */
export function windSeries(series: Series<"wind">): Series<"wind"> {
  return {
    ...series,
    days: series.days.map((day) => ({
      ...day,
      value: Math.round(day.value * 3.6 * 10) / 10,
    })),
  };
}

/**
 * Each day's strongest gust, kept for only about a year. The Daily Weather Observations'
 * gust is the whole day's, so it wins over a run's, which is only the strongest so far.
 */
export function gustSeries(rows: readonly SavedGust[]): Series<"gust"> {
  return pastYearSeries({
    measure: "gust",
    days: rows.flatMap(({ date, feedGust, dwoGust }): SeriesDay[] => {
      if (dwoGust !== null) {
        return [{ date, value: dwoGust, status: "confirmed" }];
      }
      return feedGust === null
        ? []
        : [{ date, value: feedGust, status: "provisional" }];
    }),
    fullRecord: false,
  });
}

/** Marks a series whose values are kept for only about a year, such as the 9am and 3pm readings. */
export function pastYearSeries<Measure extends FactMeasure>(
  series: Series<Measure>,
): Series<Measure> {
  return { ...series, pastYear: true };
}
