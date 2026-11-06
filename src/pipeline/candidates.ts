import type {
  Comparison,
  DateRange,
  DayValue,
  Direction,
  FactMeasure,
  Period,
  ValueStatus,
} from "../shared/facts.ts";
import type { StationOffset } from "../shared/locations.ts";
import { generateDailyFacts } from "./daily-facts.ts";
import { generatePeriodFacts } from "./period-facts.ts";
import type { Series } from "./series.ts";

/**
 * How one day or period ranks against the comparable ones up to and including it. Every
 * period it is compared with has the same kind, so each is named by its last day.
 */
export interface CandidateFact {
  locationId: string;
  /** The last day it covers. */
  date: string;
  /** The first day it covers: the same as `date` for a single day. */
  from: string;
  period: Period;
  measure: FactMeasure;
  direction: Direction;
  value: number;
  status: ValueStatus;
  comparison: Comparison;
  /** One more than the number of comparable days or spells that beat it, so ties share a rank. */
  rank: number;
  /** Earlier comparable days or spells with exactly the same value. */
  ties: number;
  /** Comparable days or periods with a value, including this one. */
  compared: number;
  /** The first date of the measure's series. */
  recordStart: string;
  /** Whether the series goes back to when records began, so "on record" is true. */
  fullRecord: boolean;
  /** Comparable days or periods between the record start and this one with no value. */
  missingDays: number;
  /**
   * Before this one, runs of at least a week of missing days that include a comparable day,
   * or runs of comparable periods with too many missing days.
   */
  gaps: DateRange[];
  /** The most recent earlier comparable day or period that matched or beat it; null if none did. */
  since: DayValue | null;
  /** Comparable days or periods with a value after `since`, including this one; all of them if `since` is null. */
  comparedSince: number;
  /** The first later comparable day or period, up to the end of the window, that beat it. */
  beatenBy: DayValue | null;
}

export interface CandidatesRequest {
  locationId: string;
  series: readonly Series[];
  /** The window's last day, normally today in Sydney. */
  windowEnd: string;
  windowDays?: number;
  /** How much higher than the first station each later one reads, from `stationOffsets`. */
  offsets?: readonly StationOffset[];
}

/** Every candidate fact about the days and periods in the window. */
export function generateCandidates(
  request: CandidatesRequest,
): CandidateFact[] {
  return [...generateDailyFacts(request), ...generatePeriodFacts(request)];
}
