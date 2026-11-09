import type { DayForecast } from "../shared/facts.ts";
import type { SunPosition } from "../shared/sun.ts";
import { type Weather, weatherForIcon } from "../shared/weather.ts";

/** The sky that the day's forecast calls for, if the forecast covers the day. */
export function forecastWeather(
  forecast: readonly DayForecast[],
  date: string,
): Weather | undefined {
  const code = forecast.find((day) => day.date === date)?.iconCode ?? null;
  return code === null ? undefined : weatherForIcon(code);
}

/** Red, green and blue from 0 to 255, and alpha from 0 to 1. */
type Rgba = readonly [number, number, number, number];

interface SkyColours {
  top: Rgba;
  middle: Rgba;
  bottom: Rgba;
  glow: Rgba;
  overcast: Rgba;
  fog: Rgba;
  mist: Rgba;
  cloud: Rgba;
  drop: Rgba;
}

interface SkyPoint extends SkyColours {
  /** The sun's height in degrees that this point is the sky for. */
  elevation: number;
  /** How far the glow reaches, as a share of the page. */
  glowSize: number;
  stars: number;
  /** From 0 at night to 1 in full daylight. */
  daylight: number;
  /** How much of its colour is the warmth of dawn and dusk, which cloud takes away. */
  twilight: number;
}

function hex(colour: string, alpha = 1): Rgba {
  const value = Number.parseInt(colour.slice(1), 16);
  return [value >> 16, (value >> 8) & 0xff, value & 0xff, alpha];
}

// The sky at a few heights of the sun, from deep night to midday. Low sun and twilight
// are the same morning and evening; only the glow's side changes.
const points: readonly SkyPoint[] = [
  {
    elevation: -18,
    top: hex("#0b1026"),
    middle: hex("#1b2550"),
    bottom: hex("#2d3a6e"),
    glow: hex("#96a0dc", 0),
    glowSize: 40,
    overcast: hex("#2a2c3a"),
    fog: hex("#3a3f4e"),
    mist: hex("#96a0be", 0.3),
    cloud: hex("#bec3d7", 0.32),
    drop: hex("#becdf0", 0.4),
    stars: 0.8,
    daylight: 0,
    twilight: 0,
  },
  {
    elevation: -10,
    top: hex("#0e1531"),
    middle: hex("#233066"),
    bottom: hex("#48508a"),
    glow: hex("#968cc8", 0.12),
    glowSize: 40,
    overcast: hex("#2e2f3e"),
    fog: hex("#444858"),
    mist: hex("#a0a5c3", 0.3),
    cloud: hex("#c3c3dc", 0.34),
    drop: hex("#becdf0", 0.4),
    stars: 0.55,
    daylight: 0.05,
    twilight: 0.3,
  },
  {
    elevation: -4,
    top: hex("#1a2552"),
    middle: hex("#4b4f8f"),
    bottom: hex("#c27a86"),
    glow: hex("#ffa582", 0.4),
    glowSize: 38,
    overcast: hex("#423e52"),
    fog: hex("#6f6878"),
    mist: hex("#e6c8c8", 0.3),
    cloud: hex("#f0c3c3", 0.42),
    drop: hex("#c8cdeb", 0.4),
    stars: 0.12,
    daylight: 0.2,
    twilight: 1,
  },
  {
    elevation: 0,
    top: hex("#2d3a6e"),
    middle: hex("#a0608c"),
    bottom: hex("#f2a674"),
    glow: hex("#ffbe7d", 0.6),
    glowSize: 36,
    // Grey, so an overcast evening fades to grey rather than orange.
    overcast: hex("#575262"),
    fog: hex("#988e9a"),
    mist: hex("#ffdcd2", 0.33),
    cloud: hex("#ffd2cd", 0.52),
    drop: hex("#cdd2eb", 0.42),
    stars: 0,
    daylight: 0.4,
    twilight: 1,
  },
  {
    elevation: 6,
    top: hex("#33609e"),
    middle: hex("#7a9fcf"),
    bottom: hex("#f0c896"),
    glow: hex("#ffd7a0", 0.55),
    glowSize: 30,
    overcast: hex("#6a6f7e"),
    fog: hex("#a9adb6"),
    mist: hex("#fff0e6", 0.36),
    cloud: hex("#fff0e6", 0.68),
    drop: hex("#d7e1f5", 0.46),
    stars: 0,
    daylight: 0.75,
    twilight: 1,
  },
  {
    elevation: 20,
    top: hex("#23629f"),
    middle: hex("#4f93d6"),
    bottom: hex("#9ccbef"),
    glow: hex("#fff8dc", 0.55),
    glowSize: 22,
    overcast: hex("#74808f"),
    fog: hex("#b4bcc6"),
    mist: hex("#ffffff", 0.4),
    cloud: hex("#ffffff", 0.8),
    drop: hex("#e1ebfa", 0.5),
    stars: 0,
    daylight: 1,
    twilight: 0,
  },
  {
    elevation: 60,
    top: hex("#1d5a99"),
    middle: hex("#4a90d6"),
    bottom: hex("#a2d0f2"),
    glow: hex("#fffceb", 0.6),
    glowSize: 18,
    overcast: hex("#74808f"),
    fog: hex("#b4bcc6"),
    mist: hex("#ffffff", 0.4),
    cloud: hex("#ffffff", 0.8),
    drop: hex("#e1ebfa", 0.5),
    stars: 0,
    daylight: 1,
    twilight: 0,
  },
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function mixRgba(a: Rgba, b: Rgba, t: number): Rgba {
  return [
    lerp(a[0], b[0], t),
    lerp(a[1], b[1], t),
    lerp(a[2], b[2], t),
    lerp(a[3], b[3], t),
  ];
}

function mix(a: SkyPoint, b: SkyPoint, t: number): SkyPoint {
  const colour = (key: keyof SkyColours) => mixRgba(a[key], b[key], t);
  return {
    elevation: lerp(a.elevation, b.elevation, t),
    top: colour("top"),
    middle: colour("middle"),
    bottom: colour("bottom"),
    glow: colour("glow"),
    overcast: colour("overcast"),
    fog: colour("fog"),
    mist: colour("mist"),
    cloud: colour("cloud"),
    drop: colour("drop"),
    glowSize: lerp(a.glowSize, b.glowSize, t),
    stars: lerp(a.stars, b.stars, t),
    daylight: lerp(a.daylight, b.daylight, t),
    twilight: lerp(a.twilight, b.twilight, t),
  };
}

function pointAt(elevation: number): SkyPoint {
  const [first] = points;
  if (first === undefined) throw new Error("The sky has no points");
  let below = first;
  for (const above of points) {
    if (elevation <= above.elevation) {
      if (above === below) return above;
      const t =
        (elevation - below.elevation) / (above.elevation - below.elevation);
      return mix(below, above, t);
    }
    below = above;
  }
  return below;
}

interface WeatherLight {
  /** How much of dawn's and dusk's colour shows. */
  warmth: number;
  /** How much of the sun's glow shows. */
  sunlight: number;
}

// Broken cloud often makes the best sunsets. A cloudy, showery or foggy day may still have
// breaks by evening, so it keeps a hint of colour; rain and storms don't.
const weatherLight: Record<Weather, WeatherLight> = {
  clear: { warmth: 1, sunlight: 1 },
  partlyCloudy: { warmth: 1, sunlight: 0.8 },
  windy: { warmth: 1, sunlight: 0.9 },
  cloudy: { warmth: 0.25, sunlight: 0.35 },
  showers: { warmth: 0.25, sunlight: 0.45 },
  fog: { warmth: 0.25, sunlight: 0.3 },
  rain: { warmth: 0, sunlight: 0.25 },
  storm: { warmth: 0, sunlight: 0.15 },
};

const clearSky: WeatherLight = { warmth: 1, sunlight: 1 };

/** A colour faded towards the grey of the same brightness. */
function fade([red, green, blue, alpha]: Rgba, amount: number): Rgba {
  const grey = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return mixRgba([red, green, blue, alpha], [grey, grey, grey, alpha], amount);
}

const round = (value: number, places = 0) => {
  const scale = 10 ** places;
  return String(Math.round(value * scale) / scale);
};

function css([red, green, blue, alpha]: Rgba): string {
  return `rgb(${round(red)} ${round(green)} ${round(blue)} / ${round(alpha, 2)})`;
}

/** The sun's hour angle at the page's edges, a little past sunrise and sunset at midsummer. */
const edgeHourAngle = 115;

/** The sun's height at the top of the page, a little past its midsummer noon. */
const topElevation = 82;

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

/**
 * The CSS custom properties for the sky with the sun where it is, under the day's weather.
 * The glow follows the sun's arc as if facing north, towards the midday sun: up from the
 * right in the morning, highest at solar noon, and down to the left in the evening.
 */
export function skyStyle(
  { elevation, hourAngle }: Pick<SunPosition, "elevation" | "hourAngle">,
  weather?: Weather,
): Record<`--${string}`, string> {
  const point = pointAt(elevation);
  const { warmth, sunlight } =
    weather === undefined ? clearSky : weatherLight[weather];
  const fading = (1 - warmth) * point.twilight;
  const faded = (colour: Rgba) => css(fade(colour, fading));
  const [red, green, blue, alpha] = fade(point.glow, fading);
  const glow = css([red, green, blue, alpha * sunlight]);
  const x = 50 - 44 * clamp(hourAngle / edgeHourAngle, -1, 1);
  const y = 100 - 90 * clamp(elevation / topElevation, 0, 1);
  return {
    "--sky": `linear-gradient(180deg, ${faded(point.top)} 0%, ${faded(point.middle)} 50%, ${faded(point.bottom)} 100%)`,
    "--glow": `radial-gradient(circle at ${round(x, 1)}% ${round(y, 1)}%, ${glow}, transparent ${round(point.glowSize, 1)}%)`,
    "--sun-overcast": faded(point.overcast),
    "--sun-fog": faded(point.fog),
    "--sun-mist": faded(point.mist),
    "--sun-cloud": faded(point.cloud),
    "--sun-drop": css(point.drop),
    "--stars": round(point.stars, 2),
    "--daylight": round(point.daylight, 2),
  };
}
