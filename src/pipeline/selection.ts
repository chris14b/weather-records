import type {
  Fact,
  FactMeasure,
  FactWhy,
  LocationFacts,
  RankedDay,
} from "../shared/facts.ts";
import { beats, comparisonKey, type DailyFact } from "./daily-facts.ts";
import { daysBetween } from "./dates.ts";
import { scoreFact, type ScoredFact } from "./scoring.ts";
import type { Series } from "./series.ts";
import { describeFact } from "./wording.ts";

type Section = Exclude<keyof LocationFacts, "locationId">;

interface SectionRule {
  /** Days before the latest day, inclusive. */
  daysAgo: { from: number; to: number };
  minimumScore: number;
  /** For a day's second and later facts. */
  minimumExtraScore: number;
  perDay: number;
  total: number;
}

// A week-long since scores log(7), so "the warmest day since last Tuesday" is enough for the
// latest week. Earlier days need about a once-a-year fact.
const sectionRules: Record<Section, SectionRule> = {
  today: {
    daysAgo: { from: 0, to: 0 },
    minimumScore: 1.75,
    minimumExtraScore: 2.5,
    perDay: 3,
    total: 3,
  },
  thisWeek: {
    daysAgo: { from: 1, to: 6 },
    minimumScore: 1.75,
    minimumExtraScore: 3.5,
    perDay: 2,
    total: 12,
  },
  thisMonth: {
    daysAgo: { from: 7, to: 30 },
    minimumScore: 5,
    minimumExtraScore: 5,
    perDay: 1,
    total: 5,
  },
};

// Facts about measures in the same family say much the same about a day.
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
};

const leaderCount = 10;

export interface SelectionRequest {
  locationId: string;
  /** Every candidate fact for the location's window, from `generateDailyFacts`. */
  facts: readonly DailyFact[];
  /** The series the facts were made from. */
  series: readonly Series[];
}

/** Chooses the few facts worth showing in each section of a location's home page. */
export function selectFacts({
  locationId,
  facts,
  series,
}: SelectionRequest): LocationFacts {
  const latest = facts.reduce(
    (last, { date }) => (date > last ? date : last),
    "",
  );
  const strongest = [
    ...Map.groupBy(
      facts.map(scoreFact),
      ({ fact }) => `${fact.date} ${families[fact.measure]} ${fact.direction}`,
    ).values(),
  ].map((group) => group.reduce(stronger));
  const section = (name: Section) =>
    pick(strongest, latest, sectionRules[name]).map((scored) =>
      present(scored, series),
    );
  return {
    locationId,
    today: section("today"),
    thisWeek: section("thisWeek"),
    thisMonth: section("thisMonth"),
  };
}

function stronger(best: ScoredFact, other: ScoredFact): ScoredFact {
  return other.score > best.score ? other : best;
}

function pick(
  facts: readonly ScoredFact[],
  latest: string,
  { daysAgo, minimumScore, minimumExtraScore, perDay, total }: SectionRule,
): ScoredFact[] {
  const perDate = new Map<string, number>();
  const picked: ScoredFact[] = [];
  const candidates = facts
    .filter(({ fact }) => {
      const ago = daysBetween(fact.date, latest);
      return ago >= daysAgo.from && ago <= daysAgo.to;
    })
    .toSorted((a, b) => b.score - a.score);
  for (const candidate of candidates) {
    if (picked.length === total) break;
    const { date } = candidate.fact;
    const count = perDate.get(date) ?? 0;
    const minimum = count === 0 ? minimumScore : minimumExtraScore;
    if (count === perDay || candidate.score < minimum) continue;
    perDate.set(date, count + 1);
    picked.push(candidate);
  }
  return picked.toSorted(
    (a, b) => b.fact.date.localeCompare(a.fact.date) || b.score - a.score,
  );
}

function present(
  { fact, score, lead }: ScoredFact,
  series: readonly Series[],
): Fact {
  return {
    date: fact.date,
    measure: fact.measure,
    direction: fact.direction,
    comparison: fact.comparison,
    status: fact.status,
    lead,
    score: Math.round(score * 100) / 100,
    text: describeFact(fact, lead),
    why: explain(fact, series),
  };
}

function explain(fact: DailyFact, series: readonly Series[]): FactWhy {
  const { measure, direction, comparison, date } = fact;
  const days = series.find((s) => s.measure === measure)?.days ?? [];
  const key = comparisonKey(date, comparison);
  const ranked = days
    .filter(
      (day) => day.date <= date && comparisonKey(day.date, comparison) === key,
    )
    .toSorted((a, b) =>
      a.value === b.value
        ? a.date.localeCompare(b.date)
        : beats(a.value, b.value, direction)
          ? -1
          : 1,
    );
  const leaders: RankedDay[] = [];
  for (const [index, { date: leaderDate, value }] of ranked
    .slice(0, leaderCount)
    .entries()) {
    const previous = leaders[index - 1];
    leaders.push({
      date: leaderDate,
      value,
      rank: previous?.value === value ? previous.rank : index + 1,
    });
  }
  const record = ranked.find((day) => day.date < date);
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
    since: fact.since,
    beatenBy: fact.beatenBy,
    leaders,
  };
}
