import type { Direction } from "../shared/facts.ts";
import { beats } from "./daily-facts.ts";

/**
 * The distinct earlier values that a value at `from` doesn't beat but one at `to` does,
 * nearest `from` first. These are where a day's rank or since would change on the way.
 */
export function boundariesBetween(
  values: readonly number[],
  from: number,
  to: number,
  direction: Direction,
): number[] {
  return [
    ...new Set(
      values.filter(
        (value) =>
          !beats(from, value, direction) && beats(to, value, direction),
      ),
    ),
  ].toSorted((a, b) => (beats(a, b, direction) ? 1 : -1));
}

/** The nearest value that beats `value`, at the 0.1 resolution of BOM's values. */
export function justBeyond(value: number, direction: Direction): number {
  const step = direction === "highest" ? 1 : -1;
  return (Math.round(value * 10) + step) / 10;
}
