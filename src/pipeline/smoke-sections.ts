import { locationById, stationOffsets } from "../shared/locations.ts";
import { generateCandidates } from "./candidates.ts";
import { sydneyDate } from "./dates.ts";
import { readSavedSeries } from "./saved-series.ts";
import { selectFacts } from "./selection.ts";

const [locationId = "sydney-observatory-hill", date = sydneyDate(new Date())] =
  process.argv.slice(2);
const location = locationById(locationId);
const series = await readSavedSeries(location);
const selected = selectFacts({
  locationId,
  facts: generateCandidates({
    locationId,
    series,
    windowEnd: date,
    offsets: stationOffsets(location),
  }),
  series,
});

console.log(`${location.name}, for the 31 days to ${date}`);
for (const section of ["today", "thisWeek", "thisMonth"] as const) {
  console.log(`\n${section}:`);
  for (const { from, date: factDate, score, text } of selected[section]) {
    const dates = from === factDate ? factDate : `${from}..${factDate}`;
    console.log(
      `  ${dates.padEnd(22)}  ${score.toFixed(2).padStart(5)}  ${text}`,
    );
  }
}
