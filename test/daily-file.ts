import type { RecentDay } from "../src/pipeline/daily-files.ts";
import { addDays } from "../src/pipeline/dates.ts";

const preamble = (stationName: string, monthTitle: string) => [
  "'IDCKWCDE51,,,,,,,,,,",
  "Australian Government Bureau of Meteorology,,,,,,,,,,",
  "South Australia,,,,,,,,,,",
  "",
  `Daily Evapotranspiration for ${stationName} New South Wales for ${monthTitle},,,,,,,,,,`,
  "Issued at 22:31 GMT on Thursday 29 October 2026,,,,,,,,,,",
  "© Copyright Commonwealth of Australia 2026 Bureau of Meteorology (ABN 92 637 533 532),,,,,,,,,,",
  "Please note Copyright Disclaimer and Privacy Notice <http://www.bom.gov.au/other/copyright.shtml>,,,,,,,,,,",
  "",
  ",,Evapo-,,Pan,,,Maximum,Minimum,Average,",
  ",,Transpiration,Rain,Evaporation,Maximum,Minimum,Relative,Relative,10m Wind,Solar",
  "Station Name,Date,0000-2400,0900-0900,0900-0900,Temperature,Temperature,Humidity,Humidity,Speed,Radiation",
  ",,(mm),(mm),(mm),(°C),(°C),(%),(%),(m/sec),(MJ/sq m)",
];

/** A monthly daily file in BOM's format and Latin-1 encoding, naming the station as given. */
export function dailyFile(
  stationName: string,
  days: readonly RecentDay[],
): Buffer {
  const month = days[0]?.date.slice(0, 7) ?? "2026-10";
  const monthTitle = new Date(`${month}-01T00:00:00Z`).toLocaleString("en-AU", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const cell = (value: number | null) =>
    value === null ? " " : value.toFixed(1);
  const rows = days.map(({ date, rain, maxTemp, minTemp }) => {
    const [year, mm, dd] = date.split("-");
    return `${stationName},${dd ?? ""}/${mm ?? ""}/${year ?? ""},3.1,${cell(rain)}, ,${cell(maxTemp)},${cell(minTemp)},79,18,0.00,21.89`;
  });
  const text = [
    ...preamble(stationName, monthTitle),
    ...rows,
    "Totals:,,88.7,148.4, ,,,,,,",
  ].join("\n");
  return Buffer.from(text, "latin1");
}

/** Consecutive days from `first`, each with the values given. */
export function daysFrom(
  first: string,
  ...values: [number | null, number | null, number | null][]
): RecentDay[] {
  return values.map(([rain, maxTemp, minTemp], index) => ({
    date: addDays(first, index),
    rain,
    maxTemp,
    minTemp,
  }));
}

/** `count` consecutive days from `first`, all with the same values. */
export function repeatedDays(
  first: string,
  count: number,
  values: [number | null, number | null, number | null],
): RecentDay[] {
  return daysFrom(first, ...Array.from({ length: count }, () => values));
}
