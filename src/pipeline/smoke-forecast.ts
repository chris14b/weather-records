import { locationById, stationOffsets } from "../shared/locations.ts";
import { generateCandidates } from "./candidates.ts";
import { addDays } from "./dates.ts";
import { forecastPath, parseForecast, type ForecastDay } from "./forecast.ts";
import { forecastStart, type ForecastInput } from "./forecast-facts.ts";
import { connectToBom } from "./ftp.ts";
import { readSavedSeries } from "./saved-series.ts";
import { selectFacts } from "./selection.ts";
import type { Series } from "./series.ts";

// With a date, the week from it is "forecast" from what was observed, as a morning run
// that day would have seen it, and the data stops the day before.
const [locationId = "sydney-observatory-hill", date] = process.argv.slice(2);
const location = locationById(locationId);
const saved = await readSavedSeries(location);

const { series, forecast } =
  date === undefined ? await live(saved) : hindcast(saved, date);
const windowEnd = addDays(forecast.from, -1);
const selected = selectFacts({
  locationId,
  facts: generateCandidates({
    locationId,
    series,
    windowEnd,
    offsets: stationOffsets(location),
    forecast,
  }),
  series,
  forecast,
});

console.log(`${location.name}, forecast from ${forecast.from}`);
console.table(forecast.days);
for (const { from, date: factDate, score, text } of selected.comingWeek) {
  const dates = from === factDate ? factDate : `${from}..${factDate}`;
  console.log(
    `  ${dates.padEnd(22)}  ${score.toFixed(2).padStart(5)}  ${text}`,
  );
}

async function live(
  series: Series[],
): Promise<{ series: Series[]; forecast: ForecastInput }> {
  const ftp = connectToBom();
  try {
    const bytes = await ftp.download(forecastPath);
    if (bytes === undefined) throw new Error(`${forecastPath} does not exist`);
    const { days } = parseForecast(bytes, location.forecastArea);
    return { series, forecast: { days, from: forecastStart(new Date()) } };
  } finally {
    ftp.close();
  }
}

function hindcast(
  series: Series[],
  from: string,
): { series: Series[]; forecast: ForecastInput } {
  const observed = (measure: string, day: string) =>
    series.find((s) => s.measure === measure)?.days.find((d) => d.date === day)
      ?.value ?? null;
  const days = Array.from({ length: 7 }, (_, index): ForecastDay => {
    const day = addDays(from, index);
    const round = (value: number | null) =>
      value === null ? null : Math.round(value);
    const rain = observed("rain", addDays(day, 1));
    return {
      date: day,
      minTemp: index === 0 ? null : round(observed("minTemp", day)),
      maxTemp: round(observed("maxTemp", day)),
      rainChance: rain === null ? null : rain > 0 ? 80 : 0,
      rain50: rain,
      rain25: rain === null ? null : Math.round(rain * 15) / 10,
    };
  });
  const before = series.map((s) => ({
    ...s,
    days: s.days.filter((d) => d.date < from),
  }));
  return { series: before, forecast: { days, from } };
}
