import { gunzipSync } from "fflate";
import { parseTar } from "nanotar";
import { currentStation, type Location } from "../shared/locations.ts";
import { inContext } from "./errors.ts";
import type { SavedRow } from "./saved-table.ts";
import type { FromStation } from "./stations.ts";

export const readingsArchivePath = "/anon/gen/fwo/IDN60910.tgz";

/** Each field saved from a reading, by its name in the feed. */
const readingFields = {
  temp: { json: "air_temp", type: "number" },
  relHum: { json: "rel_hum", type: "number" },
  dewPoint: { json: "dewpt", type: "number" },
  pressure: { json: "press_msl", type: "number" },
  cloud: { json: "cloud_oktas", type: "number" },
  windDir: { json: "wind_dir", type: "text" },
  windSpeed: { json: "wind_spd_kmh", type: "number" },
  gust: { json: "gust_kmh", type: "number" },
} as const;

type Field = keyof typeof readingFields;

const fieldNames = Object.keys(readingFields) as Field[];

const readingTimes = { "9am": "090000", "3pm": "150000" } as const;

type Time = keyof typeof readingTimes;

type ReadingSchema = {
  readonly [
    Column in `${Field}${Time}`
  ]: Column extends `${infer F extends Field}${Time}`
    ? (typeof readingFields)[F]["type"]
    : never;
};

/** One column per field and time: all the 9am fields, then all the 3pm ones. */
export const readingSchema = Object.fromEntries(
  Object.keys(readingTimes).flatMap((time) =>
    Object.entries(readingFields).map(([field, { type }]) => [
      `${field}${time}`,
      type,
    ]),
  ),
) as ReadingSchema;

/**
 * A day's readings at exactly 9am and 3pm local time: temperature and dew point (°C),
 * relative humidity (%), mean sea level pressure (hPa), cloud (oktas), wind direction
 * (a compass point or CALM), and wind speed and gust (km/h).
 */
export type DailyReadings = SavedRow<ReadingSchema>;

type Reading = {
  date: string;
  time: string;
} & { [F in Field]: DailyReadings[`${F}9am`] };

const windDirections = new Set([
  ..."N NNE NE ENE E ESE SE SSE S SSW SW WSW W WNW NW NNW".split(" "),
  "CALM",
]);

/**
 * Reads the 9am and 3pm readings of a location's current station from the archive of
 * recent observations. A reading not taken at exactly that time is never used instead.
 */
export function parseReadings(
  archive: Uint8Array,
  location: Location,
): FromStation<DailyReadings>[] {
  const station = currentStation(location);
  const { wmo } = station;
  if (wmo === undefined) {
    throw new Error(`Station ${station.station} has no WMO number`);
  }
  const name = `IDN60910.${wmo}.json`;
  const files = parseTar(gunzipSync(archive), {
    filter: (file) => file.name === name,
  });
  const [file] = files;
  if (file?.data === undefined || files.length > 1) {
    throw new Error(
      `${readingsArchivePath} should hold one ${name}, found ${String(files.length)}`,
    );
  }

  return inContext(name, () => {
    const readings = parseRows(
      JSON.parse(new TextDecoder().decode(file.data)),
      wmo,
      location.name,
    );
    const days = new Map<string, FromStation<DailyReadings>>();
    const seen = new Map<string, Reading>();
    for (const reading of readings) {
      const time = (Object.keys(readingTimes) as Time[]).find(
        (time) => readingTimes[time] === reading.time,
      );
      if (time === undefined) continue;

      const key = `${reading.date} ${reading.time}`;
      const previous = seen.get(key);
      if (previous !== undefined) {
        if (fieldNames.some((field) => previous[field] !== reading[field])) {
          throw new Error(`two different readings at ${key}`);
        }
        continue;
      }
      seen.set(key, reading);

      const day =
        days.get(reading.date) ??
        ({
          date: reading.date,
          ...Object.fromEntries(
            Object.keys(readingSchema).map((column) => [column, null]),
          ),
          station: station.station,
        } as FromStation<DailyReadings>);
      days.set(reading.date, {
        ...day,
        ...Object.fromEntries(
          fieldNames.map((field) => [`${field}${time}`, reading[field]]),
        ),
      });
    }
    return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  });
}

function parseRows(
  json: unknown,
  wmo: string,
  locationName: string,
): Reading[] {
  const root = field(json, "observations");
  const [header] = arrayField(root, "header");
  const expectedHeader = { ID: "IDN60910", wmo_id: wmo, name: locationName };
  for (const [key, expected] of Object.entries(expectedHeader)) {
    const found = field(header, key);
    if (found !== expected) {
      throw new Error(
        `expected the header's ${key} to be ${expected}, found ${JSON.stringify(found)}`,
      );
    }
  }

  return arrayField(root, "data").map((row, index) =>
    inContext(`observation ${String(index)}`, () => {
      if (field(row, "wmo") !== Number(wmo)) {
        throw new Error(
          `expected wmo ${wmo}, found ${JSON.stringify(field(row, "wmo"))}`,
        );
      }
      if (field(row, "name") !== locationName) {
        throw new Error(
          `expected name ${locationName}, found ${JSON.stringify(field(row, "name"))}`,
        );
      }
      const local = field(row, "aifstime_local");
      if (typeof local !== "string" || !/^\d{14}$/.test(local)) {
        throw new Error(`invalid aifstime_local ${JSON.stringify(local)}`);
      }
      const values = Object.fromEntries(
        Object.entries(readingFields).map(([name, { json, type }]) => [
          name,
          type === "text" ? windDirection(row, json) : numberField(row, json),
        ]),
      );
      return {
        date: `${local.slice(0, 4)}-${local.slice(4, 6)}-${local.slice(6, 8)}`,
        time: local.slice(8),
        ...values,
      } as Reading;
    }),
  );
}

function field(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null || !(key in value)) {
    throw new Error(`expected a ${key} field`);
  }
  return (value as Record<string, unknown>)[key];
}

function arrayField(value: unknown, key: string): unknown[] {
  const found = field(value, key);
  if (!Array.isArray(found)) throw new Error(`expected ${key} to be a list`);
  return found;
}

function numberField(value: unknown, key: string): number | null {
  const found = field(value, key);
  if (found !== null && typeof found !== "number") {
    throw new Error(
      `expected ${key} to be a number, found ${JSON.stringify(found)}`,
    );
  }
  return found;
}

/** A wind direction, or null for BOM's "-", which means none was reported. */
function windDirection(value: unknown, key: string): string | null {
  const found = field(value, key);
  if (found === "-") return null;
  if (typeof found !== "string" || !windDirections.has(found)) {
    throw new Error(`invalid ${key} ${JSON.stringify(found)}`);
  }
  return found;
}
