import type { FactMeasure, ValueStatus } from "../shared/facts.ts";
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

/** One measure's single-day values for a location, in date order. */
export interface Series {
  measure: FactMeasure;
  days: readonly SeriesDay[];
  /** Whether the values go back to when records began. */
  fullRecord: boolean;
}

/**
 * Keeps a layered ZIP measure's single-day values. Multi-day values are left out, so the
 * days they cover are missing.
 */
export function layeredSeries(
  measure: FactMeasure,
  records: readonly LayeredRecord[],
): Series {
  const dates = new Set(records.map(({ date }) => date));
  return {
    measure,
    days: records
      .filter(({ date, periodDays }, index) =>
        isSingleDay(periodDays, index === 0 || dates.has(addDays(date, -1))),
      )
      .map(({ date, value, source }) => ({
        date,
        value,
        status: source === "snapshot" ? "provisional" : "confirmed",
      })),
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
export function rangeSeries(max: Series, min: Series): Series {
  const mins = new Map(min.days.map((day) => [day.date, day]));
  return {
    measure: "range",
    days: max.days.flatMap(({ date, value, status }) => {
      const low = mins.get(date);
      if (low === undefined) return [];
      return [
        {
          date,
          value: Math.round((value - low.value) * 10) / 10,
          status:
            status === "confirmed" && low.status === "confirmed"
              ? "confirmed"
              : "provisional",
        },
      ];
    }),
    fullRecord: max.fullRecord && min.fullRecord,
  };
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
  ];
}

/**
 * Takes one column of saved rows, such as the FTP history or the 9am and 3pm readings,
 * whose history starts after records began.
 */
export function columnSeries<Column extends FactMeasure>(
  measure: Column,
  rows: readonly ({ date: string } & Record<Column, number | null>)[],
): Series {
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
