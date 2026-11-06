import { locationById } from "../shared/locations.ts";
import { generateDailyFacts } from "./daily-facts.ts";
import { sydneyDate } from "./dates.ts";
import { readSavedSeries } from "./saved-series.ts";

const [
  locationId = "sydney-observatory-hill",
  date = sydneyDate(new Date()),
  maxRank = "3",
] = process.argv.slice(2);
const location = locationById(locationId);
const series = await readSavedSeries(location);

const facts = generateDailyFacts({
  locationId,
  series,
  windowEnd: date,
  windowDays: 1,
});
console.log(`${location.name} on ${date}, ranks up to ${maxRank}:`);
console.table(
  facts
    .filter(({ rank }) => rank <= Number(maxRank))
    .map(({ since, beatenBy, gaps, ...fact }) => ({
      measure: fact.measure,
      direction: fact.direction,
      value: fact.value,
      status: fact.status,
      comparison: fact.comparison,
      rank: fact.rank,
      ties: fact.ties,
      compared: fact.compared,
      since: since?.date ?? "",
      beatenBy: beatenBy?.date ?? "",
      missing: fact.missingDays,
      gaps: gaps.map(({ from, to }) => `${from}..${to}`).join(" "),
    })),
);
