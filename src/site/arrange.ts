import {
  type Fact,
  furtherFactScores,
  isForecastStatus,
  type PageFacts,
  type Section,
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
  standouts: ReadonlyMap<Fact, number>;
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

  const standouts = new Map<Fact, number>();
  for (const section of sections) {
    for (const fact of facts[section]) {
      const strength = standout(fact, section);
      if (strength !== undefined) standouts.set(fact, strength);
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

const sections: readonly Section[] = [
  "today",
  "pastWeek",
  "pastMonth",
  "comingWeek",
];

/** About a once-in-2-years day for one measure, and every 3 months or so across them all. */
const exceptionalScore = 6.5;
const maxStrength = 1.5;

/**
 * How far a fact stands out in its section, if it does: from 0 at twice as rare as the
 * section needs to 1 at the same exceptional score everywhere, and on to 1.5. Forecasts,
 * conditional or not, keep to the coming week's rules, even in Today. Daylight comes round
 * every year.
 */
export function standout(fact: Fact, section: Section): number | undefined {
  if (fact.kind === "daylight") return undefined;
  const twiceAsRare =
    furtherFactScores[isForecast(fact) ? "comingWeek" : section] + Math.log(2);
  if (fact.score < twiceAsRare) return undefined;
  const strength = Math.min(
    maxStrength,
    (fact.score - twiceAsRare) / (exceptionalScore - twiceAsRare),
  );
  return Math.round(strength * 100) / 100;
}

function isForecast(fact: Fact): boolean {
  return fact.kind === "record" && isForecastStatus(fact.status);
}
