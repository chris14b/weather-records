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
  /** The local hour on the start date from which the value is saved, if before the window closes. */
  savedFromHour?: number;
}

/**
 * The maximum's window runs to 9pm, after the day's last run, so the running maximum is
 * saved from 4pm, when the day's maximum has usually come. Later runs overwrite it.
 */
export const maxSavedFromHour = 16;

/** The hour the maximum's window closes, when its value is the day's. */
export const maxWindowClosesHour = 21;

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
    end: `${String(maxWindowClosesHour)}:00`,
    creditStart: true,
    savedFromHour: maxSavedFromHour,
  },
};

const valuePattern = /^-?\d+(\.\d+)?$/;

const msPerDay = 86_400_000;

/** A measure whose value builds up through its window, so it is a floor or a ceiling until the window closes. */
export type RunningMeasure = Measure;

/** A value whose window is still open, never saved as the day's value. */
export interface RunningValue {
  measure: RunningMeasure;
  /** The date its window's value is credited to. */
  date: string;
  value: number;
  /** When it was read, as an ISO instant. */
  observedAt: string;
}

interface StationObservation {
  station: string;
  observedAt: number;
  elements: readonly XmlElement[];
}

/**
 * Reads a location's current station from the latest observations: the rain to 9am and the
 * overnight minimum once their windows have closed by the time of the observation, and the
 * daytime maximum from `maxSavedFromHour`. A value read earlier is left out.
 */
export function parseObservations(
  bytes: Uint8Array,
  location: Location,
): FromStation<RecentDay>[] {
  return readStation(bytes, location, ({ station, observedAt, elements }) => {
    const days = new Map<string, FromStation<RecentDay>>();
    for (const [measure, window] of Object.entries(windows) as [
      Measure,
      Window,
    ][]) {
      const settled = settledValue(elements, window, observedAt);
      if (settled === undefined) continue;
      const day = days.get(settled.date) ?? {
        date: settled.date,
        rain: null,
        maxTemp: null,
        minTemp: null,
        station,
      };
      days.set(settled.date, { ...day, [measure]: settled.value });
    }
    return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  });
}

/**
 * Reads the values still building up at the time of the observation: the maximum before
 * its window closes at 9pm, the minimum before 9am, and the rain since 9am, credited to
 * the 24 hours to 9am that it is part of.
 */
export function parseRunningValues(
  bytes: Uint8Array,
  location: Location,
): RunningValue[] {
  return readStation(bytes, location, ({ observedAt, elements }) => {
    const read = (measure: RunningMeasure, found: RunningRead | undefined) =>
      found === undefined
        ? []
        : [
            {
              measure,
              ...found,
              observedAt: new Date(observedAt).toISOString(),
            },
          ];
    return [
      ...read("maxTemp", runningValue(elements, windows.maxTemp, observedAt)),
      ...read("minTemp", runningValue(elements, windows.minTemp, observedAt)),
      ...read("rain", rainSince9am(elements)),
    ];
  });
}

function readStation<T>(
  bytes: Uint8Array,
  location: Location,
  read: (observation: StationObservation) => T,
): T {
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
      const surface = child(period, "level");
      checkAttribute(surface, "type", "surface");
      return read({
        station: station.station,
        observedAt: Date.parse(attribute(period, "time-utc")),
        elements: children(surface, "element"),
      });
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

function onlyElement(
  elements: readonly XmlElement[],
  type: string,
): XmlElement | undefined {
  const matching = elements.filter((element) => element.type === type);
  if (matching.length > 1) {
    throw new Error(`expected at most one ${type} element`);
  }
  return matching[0];
}

interface CheckedWindow {
  element: XmlElement;
  /** Its local start, as given. */
  start: string;
  startDate: string;
  endDate: string;
}

function checkedWindow(element: XmlElement, window: Window): CheckedWindow {
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
  return { element, start, startDate, endDate };
}

function settledValue(
  elements: readonly XmlElement[],
  window: Window,
  observedAt: number,
): RunningRead | undefined {
  const element = onlyElement(elements, window.type);
  if (element === undefined) return undefined;
  return inContext(window.type, () => {
    const { start, startDate, endDate } = checkedWindow(element, window);
    const savedFrom =
      window.savedFromHour === undefined
        ? attribute(element, "end-time-utc")
        : `${startDate}T${String(window.savedFromHour).padStart(2, "0")}:00:00${start.slice(19)}`;
    if (Date.parse(savedFrom) > observedAt) return undefined;
    return {
      date: window.creditStart ? startDate : endDate,
      value: numberIn(element),
    };
  });
}

interface RunningRead {
  date: string;
  value: number;
}

function runningValue(
  elements: readonly XmlElement[],
  window: Window,
  observedAt: number,
): RunningRead | undefined {
  const element = onlyElement(elements, window.type);
  if (element === undefined) return undefined;
  return inContext(window.type, () => {
    const { startDate, endDate } = checkedWindow(element, window);
    if (Date.parse(attribute(element, "end-time-utc")) <= observedAt) {
      return undefined;
    }
    return {
      date: window.creditStart ? startDate : endDate,
      value: numberIn(element),
    };
  });
}

function rainSince9am(
  elements: readonly XmlElement[],
): RunningRead | undefined {
  const element = onlyElement(elements, "rainfall");
  if (element === undefined) return undefined;
  return inContext("rainfall", () => {
    const start = attribute(element, "start-time-local");
    const length =
      Date.parse(attribute(element, "end-time-utc")) -
      Date.parse(attribute(element, "start-time-utc"));
    if (start.slice(11, 16) !== "09:00" || length < 0 || length > msPerDay) {
      throw new Error(
        `expected a window from 09:00 for up to a day, found ${start} to ${attribute(element, "end-time-local")}`,
      );
    }
    return { date: addDays(start.slice(0, 10), 1), value: numberIn(element) };
  });
}

function numberIn(element: XmlElement): number {
  const value = text(element);
  if (!valuePattern.test(value)) throw new Error(`invalid value ${value}`);
  return Number(value);
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
