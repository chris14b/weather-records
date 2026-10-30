import { currentStation, type Location } from "../shared/locations.ts";
import type { RecentDay } from "./daily-files.ts";
import { addDays } from "./dates.ts";
import { inContext } from "./errors.ts";
import type { FromStation } from "./stations.ts";
import {
  attribute,
  child,
  children,
  parseXml,
  text,
  textAt,
  type XmlElement,
} from "./xml.ts";

export const observationsPath = "/anon/gen/fwo/IDN60920.xml";

type Measure = Exclude<keyof RecentDay, "date">;

interface Window {
  type: string;
  /** Local start and end times, as HH:MM. */
  start: string;
  end: string;
  /** Whether the value is credited to the day the window starts on, rather than ends on. */
  creditStart: boolean;
}

const windows: Record<Measure, Window> = {
  rain: {
    type: "rainfall_24hr",
    start: "09:00",
    end: "09:00",
    creditStart: false,
  },
  minTemp: {
    type: "minimum_air_temperature",
    start: "18:00",
    end: "09:00",
    creditStart: false,
  },
  maxTemp: {
    type: "maximum_air_temperature",
    start: "06:00",
    end: "21:00",
    creditStart: true,
  },
};

const valuePattern = /^-?\d+(\.\d+)?$/;

/**
 * Reads a location's current station from the latest observations: the rain to 9am, the
 * overnight minimum and the daytime maximum, each only once its window has closed by the
 * time of the observation. A value still accumulating is left out.
 */
export function parseObservations(
  bytes: Uint8Array,
  location: Location,
): FromStation<RecentDay>[] {
  const name = observationsPath.split("/").at(-1) ?? "";
  const document = parseXml(bytes, name);
  return inContext(name, () => {
    const identifier = textAt(document, ["product", "amoc", "identifier"]);
    if (identifier !== "IDN60920") {
      throw new Error(`expected the product IDN60920, found ${identifier}`);
    }

    const station = currentStation(location);
    const element = findStation(
      child(child(document, "product"), "observations"),
      station.station,
    );
    checkAttribute(element, "stn-name", station.name);
    checkAttribute(element, "description", location.name);
    if (station.wmo !== undefined) {
      checkAttribute(element, "wmo-id", station.wmo);
    }

    return inContext(`station ${station.station}`, () => {
      const period = child(element, "period");
      checkAttribute(period, "index", "0");
      const observedAt = Date.parse(attribute(period, "time-utc"));
      const surface = child(period, "level");
      checkAttribute(surface, "type", "surface");

      const days = new Map<string, FromStation<RecentDay>>();
      for (const [measure, window] of Object.entries(windows) as [
        Measure,
        Window,
      ][]) {
        const closed = closedValue(
          children(surface, "element"),
          window,
          observedAt,
        );
        if (closed === undefined) continue;
        const day = days.get(closed.date) ?? {
          date: closed.date,
          rain: null,
          maxTemp: null,
          minTemp: null,
          station: station.station,
        };
        days.set(closed.date, { ...day, [measure]: closed.value });
      }
      return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
    });
  });
}

function findStation(observations: XmlElement, bomId: string): XmlElement {
  const found = children(observations, "station").filter(
    (station) => station["bom-id"] === bomId,
  );
  const [only] = found;
  if (only === undefined || found.length > 1) {
    throw new Error(
      `expected one station ${bomId}, found ${String(found.length)}`,
    );
  }
  return only;
}

function closedValue(
  elements: readonly XmlElement[],
  window: Window,
  observedAt: number,
): { date: string; value: number } | undefined {
  const matching = elements.filter((element) => element.type === window.type);
  if (matching.length > 1) {
    throw new Error(`expected at most one ${window.type} element`);
  }
  const [element] = matching;
  if (element === undefined) return undefined;

  return inContext(window.type, () => {
    const start = attribute(element, "start-time-local");
    const end = attribute(element, "end-time-local");
    const startDate = start.slice(0, 10);
    const endDate = end.slice(0, 10);
    const spansMidnight = window.end <= window.start;
    if (
      start.slice(11, 16) !== window.start ||
      end.slice(11, 16) !== window.end ||
      endDate !== addDays(startDate, spansMidnight ? 1 : 0)
    ) {
      throw new Error(
        `expected a window from ${window.start} to ${window.end}, found ${start} to ${end}`,
      );
    }
    if (Date.parse(attribute(element, "end-time-utc")) > observedAt) {
      return undefined;
    }
    const value = text(element);
    if (!valuePattern.test(value)) throw new Error(`invalid value ${value}`);
    return {
      date: window.creditStart ? startDate : endDate,
      value: Number(value),
    };
  });
}

function checkAttribute(
  element: XmlElement,
  name: string,
  expected: string,
): void {
  const found = attribute(element, name);
  if (found !== expected) {
    throw new Error(`expected ${name} ${expected}, found ${found}`);
  }
}
