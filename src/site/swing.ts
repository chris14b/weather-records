import type { TemperatureSwing } from "../shared/facts.ts";
import {
  addDays,
  amount,
  capitalise,
  dayOfWeekName,
  nightName,
} from "./naming.ts";

/** A value on the bar, with where it sits as a percentage of the bar's width. */
export interface Placed {
  text: string;
  at: number;
  /** Which side of its point a label sits, when it would otherwise run into another. */
  side?: "before" | "after";
}

/** What the page draws for a temperature swing, as it reads on the viewer's today. */
export interface SwingView {
  measure: TemperatureSwing["measure"];
  title: string;
  from?: Placed & { label: string };
  current?: Placed;
  forecast?: Placed & { passed: boolean };
  /** The span from `from` to `current`, the filled part of the bar. */
  filled?: { start: number; end: number };
  /** The span still to go to the forecast, drawn dashed. */
  toGo?: { start: number; end: number };
  /** A CSS gradient that keeps each temperature's colour wherever the scale starts. */
  colours: string;
  description: string;
}

/** The bar's colours, by temperature in °C. */
const colourStops: readonly (readonly [number, string])[] = [
  [8, "#5b8def"],
  [16, "#6cc3d5"],
  [23, "#f5d06b"],
  [30, "#f2994a"],
  [38, "#e5533d"],
];

/** How close, as a percentage of the bar, the labels below it can be before they move apart. */
const labelRoom = 20;

/** The bar spans at least this many degrees, so a still night doesn't fill it. */
const minimumSpan = 6;
/** How far the bar runs past the lowest and highest values, in °C. */
const margin = 1;

/**
 * The swing as the page shows it on `today`, or nothing once it is out of date: a day's
 * rise only on that day, and a night's fall until the morning it ends.
 */
export function swingView(
  swing: TemperatureSwing,
  today: string,
): SwingView | undefined {
  const { measure, date, from, current, forecast } = swing;
  const isDay = measure === "maxTemp";
  if (isDay ? date !== today : date !== today && date !== addDays(today, 1)) {
    return undefined;
  }
  const values = [from, current, forecast].filter((value) => value !== null);
  if (values.length === 0) return undefined;

  const [low, high] = scale(values);
  const at = (value: number) => percent(value, low, high);
  const text = (value: number, isForecast = false) =>
    amount(measure, value, isForecast);

  const title = isDay
    ? "Today's high"
    : `${capitalise(nightName(date, today, true))}'s low`;
  const dayBefore = addDays(date, -1);
  const fromLabel = isDay
    ? nightName(date, today)
    : `${dayBefore === today ? "today" : dayOfWeekName(dayBefore)}'s high`;
  const passed =
    forecast !== null &&
    current !== null &&
    (isDay ? current >= forecast : current <= forecast);
  const reached = current ?? from;
  const [fromSide, forecastSide] = sides(from, forecast, at);

  return {
    measure,
    title,
    ...(from === null
      ? {}
      : {
          from: {
            text: text(from),
            at: at(from),
            label: fromLabel,
            ...fromSide,
          },
        }),
    ...(current === null
      ? {}
      : { current: { text: text(current), at: at(current) } }),
    ...(forecast === null
      ? {}
      : {
          forecast: {
            text: text(forecast, true),
            at: at(forecast),
            passed,
            ...forecastSide,
          },
        }),
    ...(from === null || current === null
      ? {}
      : { filled: span(at(from), at(current)) }),
    ...(forecast === null || reached === null || passed
      ? {}
      : { toGo: span(at(reached), at(forecast)) }),
    colours: gradient(low, high),
    description: describe(swing, title, fromLabel, text),
  };
}

type Side = Pick<Placed, "side">;

function sides(
  from: number | null,
  forecast: number | null,
  at: (value: number) => number,
): [Side, Side] {
  if (from === null || forecast === null) return [{}, {}];
  if (Math.abs(at(from) - at(forecast)) >= labelRoom) return [{}, {}];
  return from < forecast
    ? [{ side: "before" }, { side: "after" }]
    : [{ side: "after" }, { side: "before" }];
}

function scale(values: readonly number[]): [number, number] {
  const low = Math.min(...values) - margin;
  const high = Math.max(...values) + margin;
  const short = Math.max(0, minimumSpan - (high - low)) / 2;
  return [low - short, high + short];
}

function span(a: number, b: number): { start: number; end: number } {
  return { start: Math.min(a, b), end: Math.max(a, b) };
}

function percent(value: number, low: number, high: number): number {
  return Math.round(((value - low) / (high - low)) * 1000) / 10;
}

function gradient(low: number, high: number): string {
  const stops = colourStops.map(
    ([temperature, colour]) =>
      `${colour} ${String(percent(temperature, low, high))}%`,
  );
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

function describe(
  { measure, from, current, forecast }: TemperatureSwing,
  title: string,
  fromLabel: string,
  text: (value: number, isForecast?: boolean) => string,
): string {
  const start =
    from === null
      ? ""
      : measure === "maxTemp"
        ? `${text(from)} ${fromLabel}`
        : `${fromLabel} of ${text(from)}`;
  const sofar =
    current === null
      ? [...(start === "" ? [] : [`${capitalise(start)}.`])]
      : [
          `${text(current)} so far${start === "" ? "" : `, ${measure === "maxTemp" ? "up" : "down"} from ${start}`}.`,
        ];
  return [
    `${title}:`,
    ...sofar,
    ...(forecast === null ? [] : [`Forecast ${text(forecast, true)}.`]),
  ].join(" ");
}
