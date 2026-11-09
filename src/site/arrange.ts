import type { Fact, LocationFacts } from "../shared/facts.ts";

/** A location's facts as the page lays them out. */
export interface Page {
  /** The latest day with facts, or failing that the viewer's today. */
  date: string;
  /** Today's strongest observed fact, or failing that its strongest forecast. */
  headline: Fact | undefined;
  /** Today's other facts, observed first, then its forecast and conditional facts. */
  today: Fact[];
  comingWeek: Fact[];
  thisWeek: Fact[];
  thisMonth: Fact[];
}

function strongest(facts: readonly Fact[]): Fact | undefined {
  return facts.reduce<Fact | undefined>(
    (best, fact) =>
      best === undefined || fact.score > best.score ? fact : best,
    undefined,
  );
}

/** Lays out a location's sections, moving the coming week's facts about the latest day into Today. */
export function arrange(location: LocationFacts, viewerToday: string): Page {
  const date = location.today[0]?.date ?? viewerToday;
  const isToday = (fact: Fact) => fact.date <= date;
  const todaysOutlook = location.comingWeek.filter(isToday);
  const headline =
    strongest(location.today) ??
    strongest(todaysOutlook.filter((fact) => fact.status === "forecast"));

  return {
    date,
    headline,
    today: [...location.today, ...todaysOutlook].filter(
      (fact) => fact !== headline,
    ),
    comingWeek: location.comingWeek.filter((fact) => !isToday(fact)),
    thisWeek: location.thisWeek,
    thisMonth: location.thisMonth,
  };
}

/** The headline's font size in rem, from 1.75 for an everyday fact to 5.5 for a record. */
export function headlineSize(score: number): number {
  const size = 1.75 + (score - 2) * 0.75;
  return Math.min(5.5, Math.max(1.75, Math.round(size * 100) / 100));
}

/** How far a fact stands out from the everyday ones. */
export type Standout = "rare" | "exceptional";

// For days and runs, about once in 2 years and once in 20. A calendar period's score
// counts periods, not days, so the same rarity scores much less.
const standoutScores = {
  days: { rare: 6.5, exceptional: 9 },
  calendar: { rare: 3.5, exceptional: 4.5 },
} as const;

/** Whether a fact is rare enough to mark, and how rare. */
export function standout({ score, period }: Fact): Standout | undefined {
  const { rare, exceptional } =
    period.kind === "day" || period.kind === "rolling"
      ? standoutScores.days
      : standoutScores.calendar;
  if (score >= exceptional) return "exceptional";
  if (score >= rare) return "rare";
  return undefined;
}
