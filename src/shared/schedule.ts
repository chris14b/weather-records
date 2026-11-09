import { sydneyInstant, sydneyOffsetMinutes } from "./sydney-time.ts";

const msPerMinute = 60_000;
const msPerDay = 1_440 * msPerMinute;

/** The scheduled runs, in minutes past midnight Sydney time; `deploy.yml` must match. */
export const updateRunsSydney: readonly number[] = [
  6, 8, 10, 12, 14, 16, 18, 20, 22,
].map((hour) => hour * 60 + 30);

function sydneyDateOf(instant: Date): string {
  const clock = instant.getTime() + sydneyOffsetMinutes(instant) * msPerMinute;
  return new Date(clock).toISOString().slice(0, 10);
}

function nextDate(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + msPerDay)
    .toISOString()
    .slice(0, 10);
}

/** The first scheduled update run after `instant`. */
export function nextUpdate(instant: Date): Date {
  const today = sydneyDateOf(instant);
  for (const date of [today, nextDate(today)]) {
    for (const minutes of updateRunsSydney) {
      const run = sydneyInstant(date, minutes);
      if (run > instant) return run;
    }
  }
  throw new Error("No update runs are scheduled");
}
