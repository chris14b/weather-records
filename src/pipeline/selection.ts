import {
  isForecastStatus,
  type Fact,
  type FactMeasure,
  type FactWhy,
  type LocationFacts,
  type Period,
  type RankedDay,
  type ValueStatus,
} from "../shared/facts.ts";
import type { CandidateFact } from "./candidates.ts";
import { beats, comparisonKey } from "./daily-facts.ts";
import { daysBetween } from "./dates.ts";
import { forecastSeries, type ForecastInput } from "./forecast-facts.ts";
import { comparablePeriods } from "./period-facts.ts";
import { scoreFact, type ScoredFact } from "./scoring.ts";
import type { Series } from "./series.ts";
import { describeFact } from "./wording.ts";

type Section = Exclude<keyof LocationFacts, "locationId">;

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
  thisWeek: {
    minimumScore: 1.75,
    minimumExtraScore: 3.5,
    perDay: 2,
    total: 12,
  },
  thisMonth: {
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
 * The latest months, seasons and years go in This month, apart from its days. They are
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

type Allowance = "days" | "calendar" | "conditional";

const extraAllowances: Partial<
  Record<Section, { allowance: Allowance; rule: SectionRule }>
> = {
  thisMonth: { allowance: "calendar", rule: calendarRule },
  comingWeek: { allowance: "conditional", rule: conditionalRule },
};

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

const leaderCount = 10;

export interface SelectionRequest {
  locationId: string;
  /** Every candidate fact for the location's window, from `generateCandidates`. */
  facts: readonly CandidateFact[];
  /** The series the facts were made from. */
  series: readonly Series[];
  /** The forecast the forecast facts were made from. */
  forecast?: ForecastInput;
}

/** Chooses the few facts worth showing in each section of a location's home page. */
export function selectFacts({
  locationId,
  facts,
  series,
  forecast,
}: SelectionRequest): LocationFacts {
  const latest = facts.reduce(
    (last, { date, status }) =>
      date > last && !isForecastStatus(status) ? date : last,
    "",
  );
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
    .filter((candidate, _, all) => !isPartOfSpell(candidate, all, latest));
  const inSection = (name: Section, allowance: Allowance) =>
    chosen.filter(
      ({ fact }) =>
        allowanceOf(fact) === allowance && sectionOf(fact, latest) === name,
    );
  const section = (name: Section) => {
    const extra = extraAllowances[name];
    const picked = [
      ...pick(inSection(name, "days"), sectionRules[name]),
      ...(extra === undefined
        ? []
        : pick(inSection(name, extra.allowance), extra.rule)),
    ];
    const shown =
      name === "comingWeek"
        ? withFallback(
            picked,
            [...inSection(name, "days"), ...inSection(name, "conditional")],
            latest,
          )
        : picked;
    return shown
      .toSorted(name === "comingWeek" ? soonestFirst : strongestFirst)
      .map((candidate) => present(candidate, series, forecast));
  };
  return {
    locationId,
    today: section("today"),
    thisWeek: section("thisWeek"),
    thisMonth: section("thisMonth"),
    comingWeek: section("comingWeek"),
  };
}

function strongestFirst(a: ScoredFact, b: ScoredFact): number {
  return b.score - a.score || b.fact.date.localeCompare(a.fact.date);
}

function soonestFirst(a: ScoredFact, b: ScoredFact): number {
  return (
    a.fact.date.localeCompare(b.fact.date) ||
    Number(a.fact.status === "conditional") -
      Number(b.fact.status === "conditional") ||
    b.score - a.score
  );
}

/**
 * The site moves forecasts about the latest day into Today. If nothing is left for the
 * coming days, the best forecast fact about them stands in, if it is worth saying at all.
 */
function withFallback(
  picked: readonly ScoredFact[],
  candidates: readonly ScoredFact[],
  latest: string,
): ScoredFact[] {
  const isAhead = ({ fact }: ScoredFact) => fact.date > latest;
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

/** Observed, forecast and conditional facts about a day say different things, so each keeps its own. */
function origin(status: ValueStatus): string {
  return isForecastStatus(status) ? status : "observed";
}

function allowanceOf({ status, period }: CandidateFact): Allowance {
  if (status === "conditional") return "conditional";
  return isCalendar(period) ? "calendar" : "days";
}

function isCalendar(period: Period): boolean {
  return period.kind !== "day" && period.kind !== "rolling";
}

// A day or a run of days goes in the section its first day falls in.
function sectionOf(fact: CandidateFact, latest: string): Section | undefined {
  if (isForecastStatus(fact.status)) return "comingWeek";
  if (isCalendar(fact.period)) return "thisMonth";
  const ago = daysBetween(fact.from, latest);
  if (ago === 0) return "today";
  if (ago <= 6) return "thisWeek";
  return ago <= 30 ? "thisMonth" : undefined;
}

// A spell stands for the days and the weaker spells that overlap it, which would only repeat it.
function isPartOfSpell(
  { fact, score }: ScoredFact,
  facts: readonly ScoredFact[],
  latest: string,
): boolean {
  if (isCalendar(fact.period)) return false;
  return facts.some((spell) => {
    const section = sectionOf(spell.fact, latest);
    return (
      spell.fact !== fact &&
      spell.fact.period.kind === "rolling" &&
      origin(spell.fact.status) === origin(fact.status) &&
      families[spell.fact.measure] === families[fact.measure] &&
      spell.fact.direction === fact.direction &&
      overlaps(spell.fact, fact) &&
      (fact.period.kind === "day"
        ? spell.score >= score
        : spell.score > score ||
          (spell.score === score && spell.fact.date > fact.date)) &&
      section !== undefined &&
      spell.score >= sectionRules[section].minimumScore
    );
  });
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
    if (count === perDay || candidate.score < minimum) continue;
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
): Fact {
  return {
    date: fact.date,
    from: fact.from,
    period: fact.period,
    measure: fact.measure,
    direction: fact.direction,
    comparison: fact.comparison,
    status: fact.status,
    lead,
    score: Math.round(score * 100) / 100,
    text: describeFact(fact, lead),
    why: explain(fact, series, forecast),
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
  const source =
    observed !== undefined && forecast !== undefined && isForecast
      ? forecastSeries(observed, forecast)
      : observed;
  const found = source === undefined ? [] : comparables(source, fact);
  // A forecast or conditional value is only in the fact itself.
  const own = isForecast
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
