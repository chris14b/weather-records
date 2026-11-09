// NOAA's solar calculator equations, after Meeus's "Astronomical Algorithms": accurate
// to about a minute for sunrise and sunset at Sydney's latitude.

const radians = Math.PI / 180;
const msPerDay = 86_400_000;
const msPerMinute = 60_000;
const j2000 = Date.UTC(2000, 0, 1, 12);

/** The sun's centre is this far below the horizon at sunrise and sunset, allowing for refraction and its radius. */
const horizonZenith = 90.833;

const sin = (degrees: number) => Math.sin(degrees * radians);
const cos = (degrees: number) => Math.cos(degrees * radians);
const tan = (degrees: number) => Math.tan(degrees * radians);
const degrees = (value: number) => value / radians;

interface SolarCoordinates {
  /** In degrees. */
  declination: number;
  /** Apparent minus mean solar time, in minutes. */
  equationOfTime: number;
}

function solarCoordinates(time: number): SolarCoordinates {
  const t = (time - j2000) / msPerDay / 36_525;
  const meanLongitude = (280.46646 + t * (36_000.76983 + t * 0.0003032)) % 360;
  const meanAnomaly = 357.52911 + t * (35_999.05029 - t * 0.0001537);
  const eccentricity = 0.016708634 - t * (0.000042037 + t * 0.0000001267);
  const centre =
    sin(meanAnomaly) * (1.914602 - t * (0.004817 + t * 0.000014)) +
    sin(2 * meanAnomaly) * (0.019993 - t * 0.000101) +
    sin(3 * meanAnomaly) * 0.000289;
  const node = 125.04 - 1934.136 * t;
  const apparentLongitude =
    meanLongitude + centre - 0.00569 - 0.00478 * sin(node);
  const meanObliquity =
    23 +
    (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const obliquity = meanObliquity + 0.00256 * cos(node);
  const y = tan(obliquity / 2) ** 2;
  const equationOfTime =
    4 *
    degrees(
      y * sin(2 * meanLongitude) -
        2 * eccentricity * sin(meanAnomaly) +
        4 * eccentricity * y * sin(meanAnomaly) * cos(2 * meanLongitude) -
        0.5 * y * y * sin(4 * meanLongitude) -
        1.25 * eccentricity * eccentricity * sin(2 * meanAnomaly),
    );
  return {
    declination: degrees(Math.asin(sin(obliquity) * sin(apparentLongitude))),
    equationOfTime,
  };
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface SunPosition {
  /** Degrees above the horizon, negative below it, without refraction. */
  elevation: number;
  /** Degrees clockwise from north. */
  azimuth: number;
}

/** Where the sun is in the sky at an instant, seen from a place. */
export function sunPosition(
  instant: Date,
  { latitude, longitude }: Coordinates,
): SunPosition {
  const time = instant.getTime();
  const { declination, equationOfTime } = solarCoordinates(time);
  const utcMinutes = (((time % msPerDay) + msPerDay) % msPerDay) / msPerMinute;
  const hourAngle = (utcMinutes + equationOfTime + 4 * longitude) / 4 - 180;
  const elevation = degrees(
    Math.asin(
      sin(latitude) * sin(declination) +
        cos(latitude) * cos(declination) * cos(hourAngle),
    ),
  );
  const fromSouth = degrees(
    Math.atan2(
      sin(hourAngle),
      cos(hourAngle) * sin(latitude) - tan(declination) * cos(latitude),
    ),
  );
  return { elevation, azimuth: (fromSouth + 180) % 360 };
}

export interface SunTimes {
  sunrise: Date;
  sunset: Date;
}

/**
 * Sunrise and sunset on a local date (YYYY-MM-DD) at a place, or nothing if the sun stays
 * up or down all day.
 */
export function sunTimes(
  date: string,
  place: Coordinates,
): SunTimes | undefined {
  const midnight = Date.parse(`${date}T00:00:00Z`);
  const sunrise = sunEvent(midnight, place, -1);
  const sunset = sunEvent(midnight, place, 1);
  if (sunrise === undefined || sunset === undefined) return undefined;
  return { sunrise: new Date(sunrise), sunset: new Date(sunset) };
}

// Each pass works out the sun's coordinates at the previous estimate, which settles to
// within a second in a few passes.
function sunEvent(
  midnight: number,
  { latitude, longitude }: Coordinates,
  side: -1 | 1,
): number | undefined {
  let estimate = midnight + (720 - 4 * longitude) * msPerMinute;
  for (let pass = 0; pass < 3; pass++) {
    const { declination, equationOfTime } = solarCoordinates(estimate);
    const cosHourAngle =
      cos(horizonZenith) / (cos(latitude) * cos(declination)) -
      tan(latitude) * tan(declination);
    if (Math.abs(cosHourAngle) > 1) return undefined;
    const hourAngle = degrees(Math.acos(cosHourAngle));
    const noon = 720 - 4 * longitude - equationOfTime;
    estimate = midnight + (noon + side * 4 * hourAngle) * msPerMinute;
  }
  return estimate;
}
