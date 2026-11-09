import type { DayForecast } from "../shared/facts.ts";
import { type Weather, weatherForIcon } from "../shared/weather.ts";

export type SkyPhase = "night" | "dawn" | "day" | "dusk";

const sydneyHourFormat = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  hour: "numeric",
  hourCycle: "h23",
});

/** The hour in Sydney at an instant, from 0 to 23. */
export function sydneyHour(instant: Date): number {
  return Number(sydneyHourFormat.format(instant));
}

/** The sky for an hour in Sydney. Fixed hours stand in for sunrise and sunset until T14. */
export function skyPhase(hour: number): SkyPhase {
  if (hour >= 5 && hour < 7) return "dawn";
  if (hour >= 7 && hour < 17) return "day";
  if (hour >= 17 && hour < 20) return "dusk";
  return "night";
}

/** The sky that the day's forecast calls for, if the forecast covers the day. */
export function forecastWeather(
  forecast: readonly DayForecast[],
  date: string,
): Weather | undefined {
  const code = forecast.find((day) => day.date === date)?.iconCode ?? null;
  return code === null ? undefined : weatherForIcon(code);
}
