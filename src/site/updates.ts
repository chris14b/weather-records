import { nextUpdate } from "../shared/schedule.ts";
import { clockTime, sydneyDate, weekdayDate } from "./naming.ts";

function atClock(instant: Date): string {
  return clockTime(instant.toISOString());
}

/**
 * When the data was made and when the next update is due, as read at `now`:
 * "Updated Monday 9 November at 10:41 am. Next update due around 10:30 pm."
 */
export function updateNote(generatedAt: string, now: Date): string {
  const generated = new Date(generatedAt);
  const updated = `Updated ${weekdayDate(sydneyDate(generated))} at ${atClock(generated)}.`;
  const due = nextUpdate(generated);
  if (now < due) {
    const day = sydneyDate(due) === sydneyDate(now) ? "" : " tomorrow";
    return `${updated} Next update due around ${atClock(due)}${day}.`;
  }
  if (now < nextUpdate(due)) {
    return `${updated} The ${atClock(due)} update is running late.`;
  }
  return `${updated} Updates are running late.`;
}
