import type { ForecastArea } from "../shared/locations.ts";
import { addDays } from "./dates.ts";
import { inContext } from "./errors.ts";
import {
  attribute,
  child,
  children,
  parseXml,
  text,
  textAt,
  type XmlElement,
} from "./xml.ts";

export const forecastPath = "/anon/gen/fwo/IDN11060.xml";

/** A day of the 7-day forecast. Null means the forecast doesn't give it. */
export interface ForecastDay {
  date: string;
  minTemp: number | null;
  maxTemp: number | null;
  /** Chance of rain, as a percentage. */
  rainChance: number | null;
  /** Rain amounts in mm with a 50% and a 25% chance of being exceeded: the forecast's range. */
  rain50: number | null;
  rain25: number | null;
}

export interface Forecast {
  /** When BOM issued the forecast, as an ISO time in UTC. */
  issuedAt: string;
  days: ForecastDay[];
}

const rainRangePattern = /^(\d+(?:\.\d+)?) to (\d+(?:\.\d+)?) mm$/;
const chancePattern = /^(\d+)%$/;
const integerPattern = /^-?\d+$/;

/** Reads a forecast area's days from the NSW town forecasts, from today onwards. */
export function parseForecast(bytes: Uint8Array, area: ForecastArea): Forecast {
  const name = forecastPath.split("/").at(-1) ?? "";
  const document = parseXml(bytes, name);
  return inContext(name, () => {
    const identifier = textAt(document, ["product", "amoc", "identifier"]);
    if (identifier !== "IDN11060") {
      throw new Error(`expected the product IDN11060, found ${identifier}`);
    }
    const issuedAt = textAt(document, ["product", "amoc", "issue-time-utc"]);

    const areas = children(
      child(child(document, "product"), "forecast"),
      "area",
    ).filter((element) => element.aac === area.aac);
    const [element] = areas;
    if (element === undefined || areas.length > 1) {
      throw new Error(
        `expected one area ${area.aac}, found ${String(areas.length)}`,
      );
    }
    return inContext(`area ${area.aac}`, () => {
      const description = attribute(element, "description");
      if (description !== area.description) {
        throw new Error(
          `expected the description ${area.description}, found ${description}`,
        );
      }
      const type = attribute(element, "type");
      if (type !== "location") {
        throw new Error(`expected the type location, found ${type}`);
      }
      return {
        issuedAt,
        days: parseDays(children(element, "forecast-period")),
      };
    });
  });
}

function parseDays(periods: readonly XmlElement[]): ForecastDay[] {
  if (periods.length === 0) throw new Error("no forecast periods");
  let previousDate: string | undefined;
  return periods.map((period, index) =>
    inContext(`forecast period ${String(index)}`, () => {
      const found = attribute(period, "index");
      if (found !== String(index)) {
        throw new Error(`expected index ${String(index)}, found ${found}`);
      }
      const date = attribute(period, "start-time-local").slice(0, 10);
      if (previousDate !== undefined && date !== addDays(previousDate, 1)) {
        throw new Error(`expected ${addDays(previousDate, 1)}, found ${date}`);
      }
      previousDate = date;
      const end = attribute(period, "end-time-local");
      if (!end.startsWith(`${addDays(date, 1)}T00:00:00`)) {
        throw new Error(`expected the period to end at midnight, found ${end}`);
      }

      const range = matchOptional(
        optionalText(period, "element", "precipitation_range"),
        rainRangePattern,
        "rain range",
      );
      const chance = matchOptional(
        optionalText(period, "text", "probability_of_precipitation"),
        chancePattern,
        "chance of rain",
      );

      return {
        date,
        minTemp: temperature(period, "air_temperature_minimum"),
        maxTemp: temperature(period, "air_temperature_maximum"),
        rainChance: chance === undefined ? null : Number(chance[1]),
        rain50: range === undefined ? null : Number(range[1]),
        rain25: range === undefined ? null : Number(range[2]),
      };
    }),
  );
}

function temperature(period: XmlElement, type: string): number | null {
  const value = matchOptional(
    optionalText(period, "element", type),
    integerPattern,
    type,
  );
  return value === undefined ? null : Number(value[0]);
}

function matchOptional(
  value: string | undefined,
  pattern: RegExp,
  label: string,
): RegExpExecArray | undefined {
  if (value === undefined) return undefined;
  const match = pattern.exec(value);
  if (match === null) throw new Error(`invalid ${label} ${value}`);
  return match;
}

/** The text of the period's one child with this tag and type, if it has one. */
function optionalText(
  period: XmlElement,
  tag: string,
  type: string,
): string | undefined {
  const matching = children(period, tag).filter(
    (element) => element.type === type,
  );
  if (matching.length > 1) throw new Error(`more than one ${type}`);
  const [element] = matching;
  return element === undefined ? undefined : text(element);
}
