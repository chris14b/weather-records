/** A measure whose day-to-day change facts can be about. */
export type ChangingMeasure = "maxTemp" | "minTemp";

/** A day's value minus the day before's, e.g. `maxTempChange`. */
export type ChangeMeasure = `${ChangingMeasure}Change`;

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
  | "relHum3pm"
  | ChangeMeasure;

export function isChangeMeasure(
  measure: FactMeasure,
): measure is ChangeMeasure {
  return measure.endsWith("Change");
}

export type Direction = "highest" | "lowest";

/**
 * Which days a day is compared with: every day, the days of the same year so far, or the
 * days of the same season, month or calendar date in every year.
 */
export type Comparison = "all" | "year" | "season" | "month" | "calendarDate";

/** A calendar period that facts can be about. Seasons are meteorological, so summer starts in December. */
export type CalendarPeriod = "month" | "season" | "year";

/**
 * The span of days a fact is about: one day, the N days to its date, or a calendar month,
 * season or year, either complete or so far.
 */
export type Period =
  | { kind: "day" }
  | { kind: "rolling"; days: number }
  | { kind: CalendarPeriod; toDate: boolean };

/**
 * Provisional values come from the live feed and may change when the daily files confirm
 * them. Forecast values come from BOM's forecast. A conditional fact holds only if the day
 * reaches its value, which is beyond the forecast.
 */
export type ValueStatus =
  "confirmed" | "provisional" | "forecast" | "conditional";

export function isForecastStatus(status: ValueStatus): boolean {
  return status === "forecast" || status === "conditional";
}

export interface DateRange {
  from: string;
  to: string;
}

export interface DayValue {
  date: string;
  value: number;
}

export interface RankedDay extends DayValue {
  rank: number;
}

/** Whether a fact's wording leads with its rank ("the 2nd hottest") or its since ("since 2018"). */
export type Lead = "rank" | "since";

/**
 * The detail behind a fact, for its "why". Every period in it has the same kind as the
 * fact's, so each is named by its last day.
 */
export interface FactWhy {
  /** For a conditional fact, the value the day would need to reach. */
  value: number;
  /** For a conditional fact, the forecast value. */
  forecast?: number;
  rank: number;
  /** Earlier comparable days with exactly the same value. */
  ties: number;
  /** Comparable days with a value, including this one. */
  compared: number;
  recordStart: string;
  /** Whether the series goes back to when records began. */
  fullRecord: boolean;
  /** Comparable days between the record start and this day with no value. */
  missingDays: number;
  /** Runs of at least a week of missing days that include a comparable day. */
  gaps: DateRange[];
  /** The best earlier comparable day. */
  record: DayValue | null;
  /** The most recent earlier comparable day that matched or beat it. */
  since: DayValue | null;
  /** The best comparable days up to and including this one. */
  leaders: RankedDay[];
}

/** A fact chosen for the home page. */
export interface Fact {
  /** The last day the fact covers, which the page names ("today", "last Tuesday"). */
  date: string;
  /** The first day it covers: the same as `date` for a single day. */
  from: string;
  period: Period;
  measure: FactMeasure;
  direction: Direction;
  comparison: Comparison;
  status: ValueStatus;
  lead: Lead;
  /** Higher is more unusual: about the log of how many comparable days pass for each fact like it. */
  score: number;
  /**
   * What the day or period was, without naming it: e.g. "the hottest day of the year so
   * far" or "the 3rd wettest October on record".
   */
  text: string;
  why: FactWhy;
}

/** The facts for each section of a location's home page, latest first. */
export interface LocationFacts {
  locationId: string;
  /** The latest day with data. */
  today: Fact[];
  /** The 6 days before it, and runs of days that start in them. */
  thisWeek: Fact[];
  /** 7 to 30 days before it, and the latest calendar periods. */
  thisMonth: Fact[];
  /** Forecast and conditional facts about the coming days, soonest first. */
  comingWeek: Fact[];
  /** BOM's forecast for the location's area, from the day of the run. */
  forecast: DayForecast[];
}

export interface DayForecast {
  date: string;
  /** BOM's forecast icon code, which `weatherForIcon` turns into a kind of sky. */
  iconCode: number | null;
  precis: string | null;
}

export interface FactsFile {
  generatedAt: string;
  locations: LocationFacts[];
}
