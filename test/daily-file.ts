import type { Station } from "../src/shared/locations.ts";
import {
  type DailyFileDay,
  dailyFilePath,
  type RecentDay,
} from "../src/pipeline/daily-files.ts";
import { addDays } from "../src/pipeline/dates.ts";
import type { Ftp } from "../src/pipeline/ftp.ts";

/** A day in a made-up daily file. Values left out are blank. */
export type FileDay = Pick<DailyFileDay, "date"> &
  Partial<Omit<DailyFileDay, "date">>;

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
  days: readonly FileDay[],
): Buffer {
  const month = days[0]?.date.slice(0, 7) ?? "2026-10";
  const monthTitle = new Date(`${month}-01T00:00:00Z`).toLocaleString("en-AU", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const cell = (value: number | null = null) =>
    value === null ? " " : String(value);
  const rows = days.map((day) => {
    const [year, mm, dd] = day.date.split("-");
    return [
      stationName,
      `${dd ?? ""}/${mm ?? ""}/${year ?? ""}`,
      "3.1",
      cell(day.rain),
      " ",
      cell(day.maxTemp),
      cell(day.minTemp),
      cell(day.maxRelHum),
      cell(day.minRelHum),
      "0.00",
      cell(day.solar),
    ].join(",");
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

/** Consecutive days from `first`, each with the humidity and solar values given. */
export function humidityAndSolarFrom(
  first: string,
  ...values: [number | null, number | null, number | null][]
): FileDay[] {
  return values.map(([maxRelHum, minRelHum, solar], index) => ({
    date: addDays(first, index),
    maxRelHum,
    minRelHum,
    solar,
  }));
}

/** Serves made-up daily files, and records the name of each file requested. */
export class FakeFtp implements Ftp {
  readonly requested: string[] = [];
  /** Names of files whose download fails. */
  readonly failing = new Set<string>();
  private readonly files = new Map<string, Uint8Array>();

  serve(
    station: Station,
    month: string,
    days: readonly FileDay[],
    nameInFile = station.name,
  ): void {
    this.files.set(
      dailyFilePath({ station, month }),
      dailyFile(nameInFile, days),
    );
  }

  download(path: string): Promise<Uint8Array | undefined> {
    const name = path.split("/").at(-1) ?? "";
    this.requested.push(name);
    if (this.failing.has(name)) {
      return Promise.reject(new Error(`Downloading ${name} failed`));
    }
    return Promise.resolve(this.files.get(path));
  }

  readonly close = (): void => undefined;
}
