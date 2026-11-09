import "./sky-preview.css";
import { type Coordinates, sunPosition, sunTimes } from "../shared/sun.ts";
import { sydneyInstant } from "../shared/sydney-time.ts";
import { type Weather, weathers } from "../shared/weather.ts";
import { clockTime, sydneyDate } from "./naming.ts";
import { element } from "./render.ts";

/** The time and weather the sky is drawn for instead of now and the forecast. */
export interface SkyPreview {
  instant: Date;
  weather: Weather | "forecast" | "none";
}

const weatherLabels: Record<Weather, string> = {
  clear: "Clear",
  partlyCloudy: "Partly cloudy",
  cloudy: "Cloudy",
  showers: "Showers",
  rain: "Rain",
  storm: "Storm",
  fog: "Fog",
  windy: "Windy",
};

const choices: [SkyPreview["weather"], string][] = [
  ["forecast", "The forecast's"],
  ["none", "No forecast"],
  ...weathers.map((kind): [Weather, string] => [kind, weatherLabels[kind]]),
];

const minutesPerDay = 24 * 60;
const playStep = 10;
const playEvery = 100;

function isChoice(value: string): value is SkyPreview["weather"] {
  return choices.some(([choice]) => choice === value);
}

function minutesInSydney(instant: Date): number {
  const [hours = 0, minutes = 0] = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  })
    .format(instant)
    .split(":")
    .map(Number);
  return hours * 60 + minutes;
}

export interface SkyPreviewOptions {
  /** The selected location, which the sun is worked out for. */
  place: () => Coordinates;
  /** Called with the preview to draw, or nothing to go back to now and the forecast. */
  onChange: (preview: SkyPreview | undefined) => void;
}

/** A panel for trying the sky at any time of any day, in any weather. For development only. */
export function mountSkyPreview({ place, onChange }: SkyPreviewOptions): {
  refresh: () => void;
} {
  const date = element("input", { type: "date" });
  const time = element("input", {
    type: "range",
    min: "0",
    max: String(minutesPerDay - 1),
    step: "1",
  });
  const timeLabel = element("output");
  const play = element("button", { type: "button" }, ["Play"]);
  const live = element("button", { type: "button" }, ["Now"]);
  const weather = element(
    "select",
    {},
    choices.map(([value, label]) => element("option", { value }, [label])),
  );
  const readout = element("p", { class: "readout" });
  let playing: ReturnType<typeof setInterval> | undefined;

  const instant = () => sydneyInstant(date.value, Number(time.value));

  const refresh = () => {
    const at = instant();
    const sun = sunPosition(at, place());
    const times = sunTimes(date.value, place());
    timeLabel.value = clockTime(at.toISOString());
    readout.textContent = [
      `Sun ${sun.elevation.toFixed(1)}° high, ${sun.azimuth.toFixed(0)}° from north`,
      times === undefined
        ? "no sunrise or sunset"
        : `sunrise ${clockTime(times.sunrise.toISOString())}, sunset ${clockTime(times.sunset.toISOString())}`,
    ].join(" · ");
  };

  const change = () => {
    const chosen = weather.value;
    onChange({
      instant: instant(),
      weather: isChoice(chosen) ? chosen : "forecast",
    });
    refresh();
  };

  const stop = () => {
    clearInterval(playing);
    playing = undefined;
    play.textContent = "Play";
  };

  const goLive = () => {
    stop();
    const now = new Date();
    date.value = sydneyDate(now);
    time.value = String(minutesInSydney(now));
    weather.value = "forecast";
    onChange(undefined);
    refresh();
  };

  date.addEventListener("input", change);
  time.addEventListener("input", change);
  weather.addEventListener("change", change);
  live.addEventListener("click", goLive);
  play.addEventListener("click", () => {
    if (playing !== undefined) {
      stop();
      return;
    }
    play.textContent = "Pause";
    playing = setInterval(() => {
      time.value = String((Number(time.value) + playStep) % minutesPerDay);
      change();
    }, playEvery);
  });

  document.body.append(
    element(
      "aside",
      { class: "glass sky-preview", "aria-label": "Sky preview" },
      [
        element("h2", {}, ["Sky preview"]),
        element("label", {}, ["Date ", date]),
        element("label", { class: "time" }, ["Time ", time, timeLabel]),
        element("label", {}, ["Weather ", weather]),
        element("div", { class: "buttons" }, [play, live]),
        readout,
      ],
    ),
  );
  goLive();
  return { refresh };
}
