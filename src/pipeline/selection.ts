import {
  furtherFactScores,
  isForecastStatus,
  overnightMeasures,
  type DaylightFact,
  type Fact,
  type FactMeasure,
  type FactWhy,
  type PageFacts,
  type Period,
  type RankedDay,
  type RecordFact,
  type Section,
  type ValueStatus,
} from "../shared/facts.ts";
import type { CandidateFact } from "./candidates.ts";
import { beats, dayKey } from "./daily-facts.ts";
import { addDays, daysBetween } from "./dates.ts";
import type { DaylightCandidate } from "./daylight-facts.ts";
import { forecastSeries, type ForecastInput } from "./forecast-facts.ts";
import { comparablePeriods } from "./period-facts.ts";
import { scoreDaylight, scoreFact, type ScoredFact } from "./scoring.ts";
import type { Series } from "./series.ts";
import { describeDaylight, describeFact } from "./wording.ts";

interface SectionRule {
  minimumScore: number;
  /** For a day's second and later facts. */
  minimumExtraScore: number;
  /** What an all-time record must score to get in however little it scores otherwise. */
  minimumRecordScore?: number;
}

// A week-long since scores log(7), so "the warmest day since last Tuesday" is enough for
// Today. The days before need more, or the short sinces of a quiet week fill Past week.
const sectionRules: Record<Section, SectionRule> = {
  today: {
    minimumScore: 1.75,
    minimumExtraScore: furtherFactScores.today,
  },
  pastWeek: {
    minimumScore: furtherFactScores.pastWeek,
    minimumExtraScore: furtherFactScores.pastWeek,
  },
  pastMonth: {
    minimumScore: furtherFactScores.pastMonth,
    minimumExtraScore: furtherFactScores.pastMonth,
  },
  // A record among under 12 periods is too easy to set.
  thisYear: {
    minimumScore: furtherFactScores.thisYear,
    minimumExtraScore: furtherFactScores.thisYear,
    minimumRecordScore: Math.log(12),
  },
  // An ordinary week's forecast scores low, and says what is coming, so its bar is a since
  // of about a week. The standout marks go by `furtherFactScores.comingWeek` instead.
  comingWeek: {
    minimumScore: 2,
    minimumExtraScore: 2,
  },
};

/**
 * The month so far goes in Past month, after its days. A record among under 12 periods is
 * too easy to set.
 */
const monthSoFarRule: SectionRule = {
  minimumScore: furtherFactScores.pastMonth,
  minimumExtraScore: furtherFactScores.pastMonth,
  minimumRecordScore: Math.log(12),
};

/**
 * Conditional facts go in the coming week apart from the forecast's, on a higher bar. Nearly
 * every forecast has a notable value within reach, so they score well above the forecast's
 * own facts, and each must also beat the forecast's by `conditionalGain`.
 */
const conditionalRule: SectionRule = {
  minimumScore: 4,
  minimumExtraScore: 4,
};

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
  wind: "wind",
  gust: "wind",
  solar: "solar",
  maxTempChange: "temperatureChange",
  minTempChange: "temperatureChange",
  meanTemp: "meanTemp",
  rainDays: "rainDays",
  meanRelHum: "humidity",
};

// A period's rain total and rain days say much the same, so it shows only the strongest.
const calendarFamilies: Partial<Record<FactMeasure, string>> = {
  rain: "rain",
  rainDays: "rain",
};

// A turning point in the daylight is news for about a week either side, and turning points
// are at least 9 days apart, so each section has room for every one in its days.
const daylightSections: readonly Section[] = [
  "today",
  "pastWeek",
  "comingWeek",
];

/**
 * Average wind, sunshine and humidity aren't the day's news: a day's facts about them wait
 * for Past week, and never count towards the newest observations. A gust is.
 */
const leftOutOfToday: ReadonlySet<FactMeasure> = new Set([
  "wind",
  "solar",
  "maxRelHum",
  "minRelHum",
  "relHum9am",
  "relHum3pm",
]);

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
      fact.date > last &&
      fact.date <= date &&
      isSettled(fact.status) &&
      !leftOutOfToday.has(fact.measure)
        ? fact.date
        : last,
    "",
  );
  const sectionFor = (fact: CandidateFact) =>
    candidateSection(fact, date, latest);
  const periodKind = ({ period }: CandidateFact) =>
    isCalendar(period) ? "calendar" : period.kind;
  const kindKey = ({ fact }: ScoredFact) =>
    `${families[fact.measure]} ${fact.direction} ${periodKind(fact)}`;
  const competesAs = ({ measure, period }: CandidateFact) =>
    isCalendar(period) ? (calendarFamilies[measure] ?? measure) : measure;
  // The month, season and year so far all end today but say different things, and go in
  // different sections, so they don't compete.
  const scope = (fact: CandidateFact) =>
    "toDate" in fact.period && fact.period.toDate ? fact.period.kind : "";
  const groupKey = ({ fact }: ScoredFact) =>
    `${fact.date} ${competesAs(fact)} ${fact.direction} ${periodKind(fact)} ${scope(fact)}`;
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
  // What it would take on one day says little when another day's forecast already says it.
  const forecastScores = new Map(
    [
      ...Map.groupBy(
        strongest.filter(
          ({ fact }) =>
            fact.status === "forecast" && sectionFor(fact) !== undefined,
        ),
        kindKey,
      ),
    ].map(([key, group]) => [key, group.reduce(stronger).score]),
  );
  const chosen = strongest
    .filter(
      (candidate) =>
        candidate.fact.status !== "conditional" ||
        candidate.score >=
          (forecastScores.get(kindKey(candidate)) ?? 0) + conditionalGain,
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
  const outlook = [
    ...pick(ahead("forecast"), sectionRules.comingWeek),
    ...pick(ahead("conditional"), conditionalRule),
  ];
  const presentAll = (candidates: readonly ScoredFact[]) =>
    candidates.map((candidate) => present(candidate, series, forecast));
  const section = (name: Section): Fact[] => {
    const observed = {
      today: pick(inSection(name, "days"), sectionRules[name]),
      pastWeek: pick(inSection(name, "days"), sectionRules[name]),
      pastMonth: [
        ...pick(inSection(name, "days"), sectionRules[name]),
        ...pick(inSection(name, "calendar"), monthSoFarRule),
      ],
      thisYear: pick(inSection(name, "calendar"), sectionRules[name]),
      comingWeek: [],
    }[name];
    const daylightFacts = daylightSections.includes(name)
      ? daylight
          .filter((fact) => daylightSection(fact.date, date) === name)
          .map(presentDaylight)
      : [];
    const forecasts = presentAll(
      outlook.filter(({ fact }) => sectionFor(fact) === name),
    );
    const others = [...presentAll(observed), ...daylightFacts];
    switch (name) {
      case "today":
        return [
          ...others.toSorted(strongestFirst),
          ...forecasts.toSorted(soonestFirst),
        ];
      case "comingWeek":
        return [...others, ...forecasts].toSorted(soonestFirst);
      case "pastWeek":
        return [...others, ...forecasts].toSorted(newestFirst);
      case "pastMonth":
        return [...others, ...forecasts].toSorted(
          (a, b) => calendarLast(a) - calendarLast(b) || newestFirst(a, b),
        );
      case "thisYear":
        return others.toSorted(
          (a, b) =>
            yearSoFarFirst(a) - yearSoFarFirst(b) || newestThenStrongest(a, b),
        );
    }
  };
  return {
    date,
    today: section("today"),
    pastWeek: section("pastWeek"),
    pastMonth: section("pastMonth"),
    thisYear: section("thisYear"),
    comingWeek: section("comingWeek"),
  };
}

function strongestFirst(a: Fact, b: Fact): number {
  return b.score - a.score || b.date.localeCompare(a.date);
}

function soonestFirst(a: Fact, b: Fact): number {
  return endsBefore(a, b) || alongside(a, b);
}

function newestFirst(a: Fact, b: Fact): number {
  return endsBefore(b, a) || alongside(a, b);
}

function calendarLast(fact: Fact): number {
  return fact.kind === "record" && isCalendar(fact.period) ? 1 : 0;
}

function yearSoFarFirst(fact: Fact): number {
  return fact.kind === "record" &&
    fact.period.kind === "year" &&
    fact.period.toDate
    ? 0
    : 1;
}

// Months, seasons and years have no part of a day, so those that end together run strongest first.
function newestThenStrongest(a: Fact, b: Fact): number {
  return b.date.localeCompare(a.date) || b.score - a.score;
}

// A night and its rain end at 9am on their date, then comes the 9am reading, then that
// date's daytime values.
function endsBefore(a: Fact, b: Fact): number {
  return a.date.localeCompare(b.date) || partOfDay(a) - partOfDay(b);
}

function partOfDay(fact: Fact): number {
  if (fact.kind !== "record") return 2;
  if (fact.measure === "temp9am" || fact.measure === "relHum9am") return 1;
  return overnightMeasures.has(fact.measure) ? 0 : 2;
}

// Facts that end together run strongest first, but what it would take comes after the
// forecast, and daylight last.
function alongside(a: Fact, b: Fact): number {
  return sameDayOrder(a) - sameDayOrder(b) || b.score - a.score;
}

function sameDayOrder(fact: Fact): number {
  if (fact.kind === "daylight") return 2;
  return fact.status === "conditional" ? 1 : 0;
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
  if (isCalendar(fact.period)) {
    return fact.period.kind === "month" && fact.period.toDate
      ? "pastMonth"
      : "thisYear";
  }
  const section = sectionOf(daysBetween(fact.from, date));
  if (leftOutOfToday.has(fact.measure)) {
    return section === "today" ? undefined : section;
  }
  if (fact.from === latest && observationDay(fact.from, fact.measure) >= date) {
    return "today";
  }
  return section;
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
  if (leftOutOfToday.has(fact.measure)) return undefined;
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
      meetsMinimum(
        spell,
        sectionRules[section].minimumScore,
        sectionRules[section],
      )
    );
  });
}

// A calendar period over a short record scores little even as a record, but is still news.
function meetsMinimum(
  { fact, score }: ScoredFact,
  minimum: number,
  { minimumRecordScore = 0 }: SectionRule,
): boolean {
  return (
    score >= minimum || (isAllTimeRecord(fact) && score >= minimumRecordScore)
  );
}

/** The outright record among all days, or among its own kind of month, season or year. */
function isAllTimeRecord({
  comparison,
  period,
  rank,
  ties,
  pastYear,
}: CandidateFact): boolean {
  return (
    rank === 1 &&
    ties === 0 &&
    pastYear === undefined &&
    (comparison === "all" || isCalendar(period))
  );
}

function stronger(best: ScoredFact, other: ScoredFact): ScoredFact {
  return other.score > best.score ? other : best;
}

function pick(facts: readonly ScoredFact[], rule: SectionRule): ScoredFact[] {
  const perDate = new Map<string, number>();
  const picked: ScoredFact[] = [];
  for (const candidate of facts.toSorted((a, b) => b.score - a.score)) {
    const { date } = candidate.fact;
    const count = perDate.get(date) ?? 0;
    const minimum = count === 0 ? rule.minimumScore : rule.minimumExtraScore;
    if (!meetsMinimum(candidate, minimum, rule)) continue;
    perDate.set(date, count + 1);
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
    ...(fact.pastYear === undefined ? {} : { pastYear: fact.pastYear }),
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
    const key = dayKey(date, comparison, fact.measure);
    return source.days
      .filter(
        (day) =>
          day.date >= fact.recordStart &&
          day.date <= date &&
          dayKey(day.date, comparison, fact.measure) === key,
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
