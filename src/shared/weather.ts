/** The kinds of sky the page draws for a day's forecast. */
export type Weather =
  | "clear"
  | "partlyCloudy"
  | "cloudy"
  | "showers"
  | "rain"
  | "storm"
  | "fog"
  | "windy";

/** BOM's forecast icon codes. Codes 5 and 7 aren't used. */
const weatherByIcon: Readonly<Partial<Record<number, Weather>>> = {
  1: "clear", // sunny
  2: "clear", // clear (night)
  3: "partlyCloudy", // partly cloudy, mostly sunny, cloud clearing
  4: "cloudy",
  6: "fog", // hazy
  8: "rain", // light rain
  9: "windy",
  10: "fog",
  11: "showers",
  12: "rain",
  13: "fog", // dusty
  14: "clear", // frost
  15: "cloudy", // snow
  16: "storm",
  17: "showers", // light showers
  18: "rain", // heavy showers
  19: "storm", // tropical cyclone
};

/** The sky for one of BOM's forecast icon codes, if BOM uses the code. */
export function weatherForIcon(code: number): Weather | undefined {
  return weatherByIcon[code];
}
