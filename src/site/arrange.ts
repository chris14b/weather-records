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
  /** The facts that stand out, judged in the section the pipeline chose them for. */
  standouts: ReadonlyMap<Fact, Standout>;
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
    strongest(
      todaysOutlook.filter(
        (fact) => fact.kind === "record" && fact.status === "forecast",
      ),
    );

  const standouts = new Map<Fact, Standout>();
  for (const section of sections) {
    for (const fact of location[section]) {
      const level = standout(fact, section);
      if (level !== undefined) standouts.set(fact, level);
    }
  }

  return {
    date,
    headline,
    today: [...location.today, ...todaysOutlook].filter(
      (fact) => fact !== headline,
    ),
    comingWeek: location.comingWeek.filter((fact) => !isToday(fact)),
    thisWeek: location.thisWeek,
    thisMonth: location.thisMonth,
    standouts,
  };
}

/** The headline's font size in rem, from 1.75 for an everyday fact to 5.5 for a record. */
export function headlineSize(score: number): number {
  const size = 1.75 + (score - 2) * 0.75;
  return Math.min(5.5, Math.max(1.75, Math.round(size * 100) / 100));
}

/** How far a fact stands out from the others in its section. */
export type Standout = "notable" | "exceptional";

/** A section of `facts.json`. */
export type Section = "today" | "thisWeek" | "thisMonth" | "comingWeek";

const sections: readonly Section[] = [
  "today",
  "thisWeek",
  "thisMonth",
  "comingWeek",
];

// What a day's further facts need in each section, from sectionRules in src/pipeline/selection.ts.
const sectionScores: Record<Section, number> = {
  today: 2.5,
  thisWeek: 3.5,
  thisMonth: 5,
  comingWeek: 4.5,
};

/** About a once-in-2-years day for one measure, and every 3 months or so across them all. */
const exceptionalScore = 6.5;

/**
 * Whether a fact stands out in its section, and how far. It is notable if it is at least
 * twice as rare as the section needs, and exceptional from the same score everywhere.
 * Daylight comes round every year, and a conditional fact may never happen.
 */
export function standout(fact: Fact, section: Section): Standout | undefined {
  if (fact.kind === "daylight" || fact.status === "conditional") {
    return undefined;
  }
  if (fact.score >= exceptionalScore) return "exceptional";
  if (fact.score >= sectionScores[section] + Math.log(2)) return "notable";
  return undefined;
}
