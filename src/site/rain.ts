import type { RainToday } from "../shared/facts.ts";
import { amount } from "./naming.ts";

/** What the page shows for the rain since midnight, as it reads on the viewer's today. */
export interface RainView {
  title: string;
  text: string;
  description: string;
}

/** The rain since midnight, or nothing once it is out of date or the reading is missing. */
export function rainView(
  { date, soFar }: RainToday,
  today: string,
): RainView | undefined {
  if (date !== today || soFar === null) return undefined;
  const text = amount("rain", soFar);
  return {
    title: "Today's rain",
    text,
    description: `Today's rain: ${text} since midnight.`,
  };
}
