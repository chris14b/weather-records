/** The kinds of sky the page draws for a day's forecast. */
export const weathers = [
  "clear",
  "frost",
  "partlyCloudy",
  "cloudy",
  "haze",
  "dust",
  "fog",
  "windy",
  "lightShowers",
  "showers",
  "heavyShowers",
  "lightRain",
  "rain",
  "storm",
  "cyclone",
  "snow",
] as const;

export type Weather = (typeof weathers)[number];

/** BOM's forecast icon codes. Codes 5 and 7 aren't used. */
const weatherByIcon: Readonly<Partial<Record<number, Weather>>> = {
  1: "clear", // sunny
  2: "clear", // clear (night)
  3: "partlyCloudy", // partly cloudy, mostly sunny, cloud clearing
  4: "cloudy",
  6: "haze",
  8: "lightRain",
  9: "windy",
  10: "fog",
  11: "showers",
  12: "rain",
  13: "dust",
  14: "frost",
  15: "snow",
  16: "storm",
  17: "lightShowers",
  18: "heavyShowers",
  19: "cyclone", // tropical cyclone
};

/** The sky for one of BOM's forecast icon codes, if BOM uses the code. */
export function weatherForIcon(code: number): Weather | undefined {
  return weatherByIcon[code];
}
