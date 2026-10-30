import { locations } from "../shared/locations.ts";
import { parseForecast } from "./forecast.ts";
import { connectToBom } from "./ftp.ts";
import { parseObservations } from "./observations.ts";
import { parseReadings } from "./readings.ts";
import { downloadLiveFeeds } from "./snapshots.ts";

const ftp = connectToBom();
try {
  const feeds = await downloadLiveFeeds(ftp);
  for (const location of locations) {
    console.log(`\n${location.name}`);
    console.log("Closed observations:");
    console.table(parseObservations(feeds.observations, location));
    console.log("9am and 3pm readings:");
    console.table(parseReadings(feeds.readings, location));
    const forecast = parseForecast(feeds.forecast, location.forecastArea);
    console.log(`Forecast issued at ${forecast.issuedAt}:`);
    console.table(forecast.days);
  }
} finally {
  ftp.close();
}
