import {
  type Fact,
  isForecastStatus,
  type PageFacts,
} from "../shared/facts.ts";

/** A location's facts as the page lays them out. */
export interface Page {
  date: string;
  /** Today's strongest observed fact, or failing that its strongest forecast. */
  headline: Fact | undefined;
  /** Today's other facts, observed first, then its forecast and conditional facts. */
  today: Fact[];
  comingWeek: Fact[];
  pastWeek: Fact[];
  pastMonth: Fact[];
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

/**
 * The page for the viewer's today, or if the updates have stopped, the latest one. The
 * page for a date would only be missing before it if the viewer's clock were wrong.
 */
export function pageFor(
  pages: readonly PageFacts[],
  viewerToday: string,
): PageFacts | undefined {
  return pages.findLast(({ date }) => date <= viewerToday) ?? pages[0];
}

/** Lays out a page's sections, leading Today with its headline. */
export function arrange(facts: PageFacts): Page {
  const headline =
    strongest(facts.today.filter((fact) => !isForecast(fact))) ??
    strongest(
      facts.today.filter(
        (fact) => fact.kind === "record" && fact.status === "forecast",
      ),
    );

  const standouts = new Map<Fact, Standout>();
  for (const section of sections) {
    for (const fact of facts[section]) {
      const level = standout(fact, section);
      if (level !== undefined) standouts.set(fact, level);
    }
  }

  return {
    date: facts.date,
    headline,
    today: facts.today.filter((fact) => fact !== headline),
    comingWeek: facts.comingWeek,
    pastWeek: facts.pastWeek,
    pastMonth: facts.pastMonth,
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
export type Section = "today" | "pastWeek" | "pastMonth" | "comingWeek";

const sections: readonly Section[] = [
  "today",
  "pastWeek",
  "pastMonth",
  "comingWeek",
];

// What a day's further facts need in each section, from sectionRules in src/pipeline/selection.ts.
const sectionScores: Record<Section, number> = {
  today: 2.5,
  pastWeek: 3.5,
  pastMonth: 5,
  comingWeek: 4.5,
};

/** About a once-in-2-years day for one measure, and every 3 months or so across them all. */
const exceptionalScore = 6.5;

/**
 * Whether a fact stands out in its section, and how far. It is notable if it is at least
 * twice as rare as the section needs, and exceptional from the same score everywhere.
 * Forecasts keep to the coming week's rules, even in Today. Daylight comes round every
 * year, and a conditional fact may never happen.
 */
export function standout(fact: Fact, section: Section): Standout | undefined {
  if (fact.kind === "daylight" || fact.status === "conditional") {
    return undefined;
  }
  const needs = sectionScores[isForecast(fact) ? "comingWeek" : section];
  if (fact.score >= exceptionalScore) return "exceptional";
  if (fact.score >= needs + Math.log(2)) return "notable";
  return undefined;
}

function isForecast(fact: Fact): boolean {
  return fact.kind === "record" && isForecastStatus(fact.status);
}
