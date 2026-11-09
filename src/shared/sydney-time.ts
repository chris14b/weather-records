const msPerMinute = 60_000;

const offsetFormat = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  timeZoneName: "longOffset",
});

/** How far Sydney's clocks are ahead of UTC at `instant`, in minutes, including daylight saving. */
export function sydneyOffsetMinutes(instant: Date): number {
  const name = offsetFormat
    .formatToParts(instant)
    .find((part) => part.type === "timeZoneName")?.value;
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(name ?? "");
  if (match === null)
    throw new Error(`Unexpected Sydney offset ${String(name)}`);
  const [, sign, hours, minutes] = match;
  return (sign === "-" ? -1 : 1) * (Number(hours) * 60 + Number(minutes));
}

/** The instant Sydney's clocks show `minutes` past midnight on a date (YYYY-MM-DD). */
export function sydneyInstant(date: string, minutes: number): Date {
  const clock = Date.parse(`${date}T00:00:00Z`) + minutes * msPerMinute;
  // The offset at the guess settles within two passes, even across a daylight saving change.
  let instant = clock - 600 * msPerMinute;
  for (let pass = 0; pass < 2; pass++) {
    instant = clock - sydneyOffsetMinutes(new Date(instant)) * msPerMinute;
  }
  return new Date(instant);
}
