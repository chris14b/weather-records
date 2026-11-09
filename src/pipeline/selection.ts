import {
  isForecastStatus,
  type DaylightFact,
  type Fact,
  type FactMeasure,
  type FactWhy,
  type PageFacts,
  type Period,
  type RankedDay,
  type RecordFact,
  type ValueStatus,
} from "../shared/facts.ts";
import type { CandidateFact } from "./candidates.ts";
import { beats, comparisonKey } from "./daily-facts.ts";
import { addDays, daysBetween } from "./dates.ts";
import type { DaylightCandidate } from "./daylight-facts.ts";
import { forecastSeries, type ForecastInput } from "./forecast-facts.ts";
import { comparablePeriods } from "./period-facts.ts";
import { scoreDaylight, scoreFact, type ScoredFact } from "./scoring.ts";
import type { Series } from "./series.ts";
import { describeDaylight, describeFact } from "./wording.ts";

type Section = Exclude<keyof PageFacts, "date">;

interface SectionRule {
  minimumScore: number;
  /** For a day's second and later facts. */
  minimumExtraScore: number;
  perDay: number;
  total: number;
  /** Whether to keep only the strongest fact per family and direction, whatever its date. */
  oncePerFamily?: boolean;
}

// A week-long since scores log(7), so "the warmest day since last Tuesday" is enough for the
// latest week. Earlier days need about a once-a-year fact.
const sectionRules: Record<Section, SectionRule> = {
  today: {
    minimumScore: 1.75,
    minimumExtraScore: 2.5,
    perDay: 3,
    total: 3,
  },
  pastWeek: {
    minimumScore: 1.75,
    minimumExtraScore: 3.5,
    perDay: 2,
    total: 12,
  },
  pastMonth: {
    minimumScore: 5,
    minimumExtraScore: 5,
    perDay: 1,
    total: 5,
  },
  comingWeek: {
    minimumScore: 3.5,
    minimumExtraScore: 4.5,
    perDay: 2,
    total: 7,
  },
};

/**
 * The latest months, seasons and years go in Past month, apart from its days. They are
 * scored among periods of their own kind, so a once-in-20-years period scores log(20).
 */
const calendarRule: SectionRule = {
  minimumScore: 3,
  minimumExtraScore: 3,
  perDay: 3,
  total: 3,
};

/**
 * Conditional facts go in the coming week apart from the forecast's. Nearly every forecast
 * has a notable value within reach, and nearby days have much the same one.
 */
const conditionalRule: SectionRule = {
  minimumScore: 4,
  minimumExtraScore: 4,
  perDay: 1,
  total: 2,
  oncePerFamily: true,
};

/** The least a forecast fact must score to stand in when the coming days have nothing better. */
const forecastFloor = 2;

/** A conditional fact must be at least twice as rare as what the forecast gets. */
const conditionalGain = Math.log(2);

type Allowance = "days" | "calendar" | "forecast" | "conditional";

// Facts about measures in the same family say much the same about a day. A change isn't in
// its measure's family: "the biggest drop in maximum" says more than "the coldest day".
const families: Record<FactMeasure, string> = {
  maxTemp: "day",
  temp3pm: "day",
  minTemp: "night",
  temp9am: "night",
  rain: "rain",
  range: "range",
  maxRelHum: "humidity",
  minRelHum: "humidity",
  relHum9am: "humidity",
  relHum3pm: "humidity",
  solar: "solar",
  maxTempChange: "temperatureChange",
  minTempChange: "temperatureChange",
};

// A turning point in the daylight is news for about a week either side, and turning points
// are at least 9 days apart, so each section has room for every one in its days.
const daylightSections: readonly Section[] = [
  "today",
  "pastWeek",
  "comingWeek",
];

const leaderCount = 10;

export interface SelectionRequest {
  /** The viewer's date that the page is for. */
  date: string;
  /** Every candidate fact for the location's window, from `generateCandidates`. */
  facts: readonly CandidateFact[];
  /** The series the facts were made from. */
  series: readonly Series[];
  /** The forecast the forecast facts were made from. */
  forecast?: ForecastInput;
  /** The turning points in the daylight around the window, from `generateDaylightFacts`. */
  daylight?: readonly DaylightCandidate[];
}

/** Chooses the few facts worth showing in each section of a location's home page on `date`. */
export function selectFacts({
  date,
  facts,
  series,
  forecast,
  daylight = [],
}: SelectionRequest): PageFacts {
  const latest = facts.reduce(
    (last, fact) =>
      fact.date > last && fact.date <= date && isSettled(fact.status)
        ? fact.date
        : last,
    "",
  );
  const sectionFor = (fact: CandidateFact) =>
    candidateSection(fact, date, latest);
  const groupKey = ({ fact }: ScoredFact) =>
    `${fact.date} ${families[fact.measure]} ${fact.direction} ${isCalendar(fact.period) ? "calendar" : fact.period.kind}`;
  // A fact that a later day beat would only send the reader to that day's.
  const scored = facts
    .filter(({ beatenBy }) => beatenBy === null)
    .map(scoreFact);
  const strongest = [
    ...Map.groupBy(
      scored,
      (candidate) => `${groupKey(candidate)} ${origin(candidate.fact.status)}`,
    ).values(),
  ].map((group) => group.reduce(stronger));
  const forecastScores = new Map(
    strongest
      .filter(({ fact }) => fact.status === "forecast")
      .map((candidate) => [groupKey(candidate), candidate.score]),
  );
  const chosen = strongest
    .filter(
      (candidate) =>
        candidate.fact.status !== "conditional" ||
        candidate.score >=
          (forecastScores.get(groupKey(candidate)) ?? 0) + conditionalGain,
    )
    .filter((candidate, _, all) => !isPartOfSpell(candidate, all, sectionFor));
  const inSection = (name: Section, allowance: Allowance) =>
    chosen.filter(
      ({ fact }) =>
        allowanceOf(fact) === allowance && sectionFor(fact) === name,
    );
  const ahead = (allowance: Allowance) =>
    chosen.filter(
      ({ fact }) =>
        allowanceOf(fact) === allowance && sectionFor(fact) !== undefined,
    );
  // Today's forecasts and the coming week's are chosen together, by the same rules.
  const outlook = withFallback(
    [
      ...pick(ahead("forecast"), sectionRules.comingWeek),
      ...pick(ahead("conditional"), conditionalRule),
    ],
    [...ahead("forecast"), ...ahead("conditional")],
    ({ fact }) => sectionFor(fact) === "comingWeek",
  );
  const presentAll = (candidates: readonly ScoredFact[]) =>
    candidates.map((candidate) => present(candidate, series, forecast));
  const section = (name: Section): Fact[] => {
    const observed =
      name === "comingWeek"
        ? []
        : [
            ...pick(inSection(name, "days"), sectionRules[name]),
            ...(name === "pastMonth"
              ? pick(inSection(name, "calendar"), calendarRule)
              : []),
          ];
    const daylightFacts = daylightSections.includes(name)
      ? daylight
          .filter((fact) => daylightSection(fact.date, date) === name)
          .map(presentDaylight)
      : [];
    const forecasts = presentAll(
      outlook.filter(({ fact }) => sectionFor(fact) === name),
    );
    if (name === "comingWeek") {
      return [...forecasts, ...daylightFacts].toSorted(soonestFirst);
    }
    return [
      ...[...presentAll(observed), ...daylightFacts].toSorted(strongestFirst),
      ...forecasts.toSorted(soonestFirst),
    ];
  };
  return {
    date,
    today: section("today"),
    pastWeek: section("pastWeek"),
    pastMonth: section("pastMonth"),
    comingWeek: section("comingWeek"),
  };
}

function strongestFirst(a: Fact, b: Fact): number {
  return b.score - a.score || b.date.localeCompare(a.date);
}

// A day's forecast facts come before what it would take, and its daylight last.
function soonestFirst(a: Fact, b: Fact): number {
  return (
    a.date.localeCompare(b.date) ||
    outlookOrder(a) - outlookOrder(b) ||
    b.score - a.score
  );
}

function outlookOrder(fact: Fact): number {
  if (fact.kind === "daylight") return 2;
  return fact.status === "conditional" ? 1 : 0;
}

/**
 * If nothing is left for the coming week once Today has its forecasts, the best forecast
 * fact for it stands in, if it is worth saying at all.
 */
function withFallback(
  picked: readonly ScoredFact[],
  candidates: readonly ScoredFact[],
  isAhead: (candidate: ScoredFact) => boolean,
): ScoredFact[] {
  if (picked.some(isAhead)) return [...picked];
  const best = candidates
    .filter(isAhead)
    .reduce<ScoredFact | undefined>(
      (strongestSoFar, candidate) =>
        strongestSoFar === undefined || candidate.score > strongestSoFar.score
          ? candidate
          : strongestSoFar,
      undefined,
    );
  return best === undefined || best.score < forecastFloor
    ? [...picked]
    : [...picked, best];
}

function isSettled(status: ValueStatus): boolean {
  return status === "confirmed" || status === "provisional";
}

/** Observed, forecast and conditional facts about a day say different things, so each keeps its own. */
function origin(status: ValueStatus): string {
  return isForecastStatus(status) ? status : "observed";
}

function allowanceOf({ status, period }: CandidateFact): Allowance {
  if (status === "forecast" || status === "conditional") return status;
  return isCalendar(period) ? "calendar" : "days";
}

function isCalendar(period: Period): boolean {
  return period.kind !== "day" && period.kind !== "rolling";
}

// Measures over by 9am on their date. The rest run past it, as the official maximum
// runs to 9am the next day.
const overnightMeasures: ReadonlySet<FactMeasure> = new Set([
  "minTemp",
  "minTempChange",
  "temp9am",
  "relHum9am",
  "rain",
]);

/** BOM's observation day for a day's value: the date of the 9am by which it is over. */
function observationDay(date: string, measure: FactMeasure): string {
  return overnightMeasures.has(measure) ? date : addDays(date, 1);
}

/**
 * Today has the newest observations, from `latest`, the last date with any. After
 * midnight, until the first run after 9am, that is the day before: its daytime values
 * stay, but its night and its rain to 9am, over before the page's date began, go to Past
 * week. A run of days goes in the section its first day falls in.
 */
function candidateSection(
  fact: CandidateFact,
  date: string,
  latest: string,
): Section | undefined {
  if (isForecastStatus(fact.status)) return forecastSection(fact, date);
  if (fact.status === "partial") return partialSection(fact, date);
  if (isCalendar(fact.period)) return "pastMonth";
  if (fact.from === latest && observationDay(fact.from, fact.measure) >= date) {
    return "today";
  }
  return sectionOf(daysBetween(fact.from, date));
}

// Today has the forecasts that end by 9am tomorrow, and after midnight the night under
// way. A forecast about a day before the page's date is out of date.
function forecastSection(
  fact: CandidateFact,
  date: string,
): Section | undefined {
  if (fact.period.kind !== "day") return "comingWeek";
  if (fact.date < date) return undefined;
  return observationDay(fact.date, fact.measure) <= addDays(date, 1)
    ? "today"
    : "comingWeek";
}

// A value still running is the latest of its measure, so it is Today's until its 9am has
// passed, when a later run has settled it.
function partialSection(
  fact: CandidateFact,
  date: string,
): Section | undefined {
  const day = observationDay(fact.date, fact.measure);
  return day >= date && day <= addDays(date, 1) ? "today" : undefined;
}

function daylightSection(day: string, date: string): Section | undefined {
  return day > date ? "comingWeek" : sectionOf(daysBetween(day, date));
}

function sectionOf(daysAgo: number): Section | undefined {
  if (daysAgo <= 0) return "today";
  if (daysAgo <= 6) return "pastWeek";
  return daysAgo <= 30 ? "pastMonth" : undefined;
}

// A spell stands for the days and the weaker spells that overlap it, which would only repeat it.
function isPartOfSpell(
  { fact, score }: ScoredFact,
  facts: readonly ScoredFact[],
  sectionFor: (fact: CandidateFact) => Section | undefined,
): boolean {
  if (isCalendar(fact.period)) return false;
  return facts.some((spell) => {
    const section = sectionFor(spell.fact);
    return (
      spell.fact !== fact &&
      spell.fact.period.kind === "rolling" &&
      !isForecastStatus(spell.fact.status) &&
      origin(spell.fact.status) === origin(fact.status) &&
      families[spell.fact.measure] === families[fact.measure] &&
      spell.fact.direction === fact.direction &&
      overlaps(spell.fact, fact) &&
      (fact.period.kind === "day"
        ? spell.score >= score
        : spell.score > score ||
          (spell.score === score && spell.fact.date > fact.date)) &&
      section !== undefined &&
      meetsMinimum(spell, sectionRules[section].minimumScore)
    );
  });
}

// A calendar period over a short record scores little even as a record, but is still news.
function meetsMinimum({ fact, score }: ScoredFact, minimum: number): boolean {
  return score >= minimum || isAllTimeRecord(fact);
}

/** The outright record among all days, or among its own kind of month, season or year. */
function isAllTimeRecord({
  comparison,
  period,
  rank,
  ties,
}: CandidateFact): boolean {
  return (
    rank === 1 && ties === 0 && (comparison === "all" || isCalendar(period))
  );
}

function stronger(best: ScoredFact, other: ScoredFact): ScoredFact {
  return other.score > best.score ? other : best;
}

function pick(
  facts: readonly ScoredFact[],
  {
    minimumScore,
    minimumExtraScore,
    perDay,
    total,
    oncePerFamily = false,
  }: SectionRule,
): ScoredFact[] {
  const perDate = new Map<string, number>();
  const familiesPicked = new Set<string>();
  const picked: ScoredFact[] = [];
  const candidates = facts.toSorted((a, b) => b.score - a.score);
  for (const candidate of candidates) {
    if (picked.length === total) break;
    const { date, measure, direction } = candidate.fact;
    const family = `${families[measure]} ${direction}`;
    const count = perDate.get(date) ?? 0;
    const minimum = count === 0 ? minimumScore : minimumExtraScore;
    if (count === perDay || !meetsMinimum(candidate, minimum)) continue;
    if (oncePerFamily && familiesPicked.has(family)) continue;
    perDate.set(date, count + 1);
    familiesPicked.add(family);
    picked.push(candidate);
  }
  return picked;
}

function present(
  { fact, score, lead }: ScoredFact,
  series: readonly Series[],
  forecast: ForecastInput | undefined,
): RecordFact {
  return {
    kind: "record",
    date: fact.date,
    from: fact.from,
    period: fact.period,
    measure: fact.measure,
    direction: fact.direction,
    comparison: fact.comparison,
    status: fact.status,
    ...(fact.observedAt === undefined ? {} : { observedAt: fact.observedAt }),
    lead,
    score: Math.round(score * 100) / 100,
    text: describeFact(fact, lead),
    why: explain(fact, series, forecast),
  };
}

function presentDaylight(candidate: DaylightCandidate): DaylightFact {
  const { date, event, scope, sunrise, sunset } = candidate;
  return {
    kind: "daylight",
    date,
    event,
    scope,
    sunrise: sunrise.toISOString(),
    sunset: sunset.toISOString(),
    score: Math.round(scoreDaylight(candidate) * 100) / 100,
    text: describeDaylight(candidate),
  };
}

function explain(
  fact: CandidateFact,
  series: readonly Series[],
  forecast: ForecastInput | undefined,
): FactWhy {
  const { measure, direction, comparison, date, from } = fact;
  const observed = series.find((s) => s.measure === measure);
  const isForecast = isForecastStatus(fact.status);
  // Only a forecast day is compared with the forecast's earlier days.
  const source =
    observed !== undefined &&
    forecast !== undefined &&
    isForecast &&
    fact.period.kind === "day"
      ? forecastSeries(observed, forecast)
      : observed;
  const found = source === undefined ? [] : comparables(source, fact);
  // A forecast, conditional or partial value is only in the fact itself.
  const own =
    isForecast || fact.status === "partial"
      ? [
          ...found.filter((spell) => spell.date !== date),
          { from, date, value: fact.value },
        ]
      : found;
  const ranked = own.toSorted((a, b) =>
    a.value === b.value
      ? a.date.localeCompare(b.date)
      : beats(a.value, b.value, direction)
        ? -1
        : 1,
  );
  // Overlapping runs of days share their rain, so each spell is counted by its best run.
  const best: Spell[] = [];
  for (const spell of ranked) {
    if (best.length === leaderCount) break;
    if (best.every((other) => !overlaps(other, spell))) best.push(spell);
  }
  const leaders: RankedDay[] = [];
  for (const [index, { date: leaderDate, value }] of best.entries()) {
    const previous = leaders[index - 1];
    leaders.push({
      date: leaderDate,
      value,
      rank: previous?.value === value ? previous.rank : index + 1,
    });
  }
  const record = ranked.find((spell) => spell.date < from);
  return {
    value: fact.value,
    rank: fact.rank,
    ties: fact.ties,
    compared: fact.compared,
    recordStart: fact.recordStart,
    fullRecord: fact.fullRecord,
    missingDays: fact.missingDays,
    gaps: fact.gaps,
    record:
      record === undefined ? null : { date: record.date, value: record.value },
    ...(fact.forecast === undefined ? {} : { forecast: fact.forecast }),
    since: fact.since,
    leaders,
  };

  function comparables(source: Series, { period }: CandidateFact): Spell[] {
    if (period.kind !== "day") {
      return comparablePeriods(source, fact).flatMap((spell) =>
        spell.value === null ? [] : [{ ...spell, value: spell.value }],
      );
    }
    const key = comparisonKey(date, comparison);
    return source.days
      .filter(
        (day) =>
          day.date <= date && comparisonKey(day.date, comparison) === key,
      )
      .map((day) => ({ from: day.date, date: day.date, value: day.value }));
  }
}

interface Span {
  from: string;
  date: string;
}

interface Spell extends Span {
  value: number;
}

function overlaps(a: Span, b: Span): boolean {
  return a.from <= b.date && b.from <= a.date;
}
