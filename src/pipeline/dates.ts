/** Whether `date` is a real calendar date written as YYYY-MM-DD. */
export function isValidDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const time = Date.parse(`${date}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().startsWith(date);
}

/** The YYYY-MM-DD date `days` after `date`. */
export function addDays(date: string, days: number): string {
  const time = new Date(`${date}T00:00:00Z`);
  time.setUTCDate(time.getUTCDate() + days);
  return time.toISOString().slice(0, 10);
}

/** Every month from `first` to `last` inclusive, each as YYYY-MM. */
export function monthsBetween(first: string, last: string): string[] {
  const months: string[] = [];
  for (
    let month = first;
    month <= last;
    month = addDays(`${month}-28`, 4).slice(0, 7)
  ) {
    months.push(month);
  }
  return months;
}

/** The calendar date in Sydney at `instant`, as YYYY-MM-DD. */
export function sydneyDate(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
  }).format(instant);
}
