import { locationById } from "../shared/locations.ts";
import { generateDailyFacts } from "./daily-facts.ts";
import { sydneyDate } from "./dates.ts";
import { readSavedSeries } from "./saved-series.ts";
import { selectFacts } from "./selection.ts";

const [locationId = "sydney-observatory-hill", date = sydneyDate(new Date())] =
  process.argv.slice(2);
const location = locationById(locationId);
const series = await readSavedSeries(location);
const selected = selectFacts({
  locationId,
  facts: generateDailyFacts({ locationId, series, windowEnd: date }),
  series,
});

console.log(`${location.name}, for the 31 days to ${date}`);
for (const section of ["today", "thisWeek", "thisMonth"] as const) {
  console.log(`\n${section}:`);
  for (const { date: factDate, score, text } of selected[section]) {
    console.log(`  ${factDate}  ${score.toFixed(2).padStart(5)}  ${text}`);
  }
}
