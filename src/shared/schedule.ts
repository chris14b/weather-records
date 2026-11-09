const msPerMinute = 60_000;
const msPerDay = 1_440 * msPerMinute;

/** The update workflow's scheduled runs, in minutes past midnight UTC; `update.yml` must match. */
export const updateRunsUtc: readonly number[] = [11 * 60 + 30, 23 * 60 + 30];

/** The first scheduled update run after `instant`. */
export function nextUpdate(instant: Date): Date {
  const time = instant.getTime();
  const midnight = time - (((time % msPerDay) + msPerDay) % msPerDay);
  for (const day of [0, 1]) {
    for (const minutes of updateRunsUtc) {
      const run = midnight + day * msPerDay + minutes * msPerMinute;
      if (run > time) return new Date(run);
    }
  }
  throw new Error("No update runs are scheduled");
}
