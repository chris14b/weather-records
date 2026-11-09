import { locationById, stationOffsets } from "../shared/locations.ts";
import { generateCandidates } from "./candidates.ts";
import { sydneyDate } from "./dates.ts";
import { daylightAround } from "./daylight-facts.ts";
import { factLine } from "./print.ts";
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
  daylight: daylightAround(location, date),
});

console.log(`${location.name}, for the 31 days to ${date}`);
for (const section of ["today", "thisWeek", "thisMonth"] as const) {
  console.log(`\n${section}:`);
  for (const fact of selected[section]) console.log(`  ${factLine(fact)}`);
}
