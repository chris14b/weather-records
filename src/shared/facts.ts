/** A daily measure that facts can be about. */
export type FactMeasure =
  | "maxTemp"
  | "minTemp"
  | "rain"
  | "range"
  | "maxRelHum"
  | "minRelHum"
  | "solar"
  | "temp9am"
  | "relHum9am"
  | "temp3pm"
  | "relHum3pm";

export type Direction = "highest" | "lowest";

/**
 * Which days a day is compared with: every day, the days of the same year so far, or the
 * days of the same season, month or calendar date in every year.
 */
export type Comparison = "all" | "year" | "season" | "month" | "calendarDate";

/** Provisional values come from the live feed and may change when the daily files confirm them. */
export type ValueStatus = "confirmed" | "provisional";

export interface DateRange {
  from: string;
  to: string;
}

export interface DayValue {
  date: string;
  value: number;
}

/** How one day ranks against the comparable days up to and including it. */
export interface DailyFact {
  locationId: string;
  date: string;
  measure: FactMeasure;
  direction: Direction;
  value: number;
  status: ValueStatus;
  comparison: Comparison;
  /** One more than the number of comparable days that beat it, so tied days share a rank. */
  rank: number;
  /** Earlier comparable days with exactly the same value. */
  ties: number;
  /** Comparable days with a value, including this one. */
  compared: number;
  /** The first date of the measure's series. */
  recordStart: string;
  /** Whether the series goes back to when records began, so "on record" is true. */
  fullRecord: boolean;
  /** Comparable days between the record start and this day with no value. */
  missingDays: number;
  /** Runs of at least a week of missing days that include a comparable day, before this day. */
  gaps: DateRange[];
  /** The most recent earlier comparable day that matched or beat it; null if none did. */
  since: DayValue | null;
  /** The first later comparable day, up to the end of the window, that beat it. */
  beatenBy: DayValue | null;
}

export interface FactsFile {
  generatedAt: string;
  facts: DailyFact[];
}
