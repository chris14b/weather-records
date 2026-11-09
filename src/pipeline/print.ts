import type { Fact } from "../shared/facts.ts";

/** A fact on one line, for the command-line tools: its dates, status, score and text. */
export function factLine(fact: Fact): string {
  const dates =
    fact.kind === "daylight" || fact.from === fact.date
      ? fact.date
      : `${fact.from}..${fact.date}`;
  const status = fact.kind === "daylight" ? "daylight" : fact.status;
  return `${dates.padEnd(22)} ${status.padEnd(11)} ${fact.score.toFixed(2).padStart(5)}  ${fact.text}`;
}
