import type { Location } from "../shared/locations.ts";

const earthRadiusKm = 6371;
const radians = Math.PI / 180;

export interface Point {
  latitude: number;
  longitude: number;
}

export interface Nearest {
  location: Location;
  kilometres: number;
}

/** The great-circle distance between two points, in kilometres. */
export function distanceKm(a: Point, b: Point): number {
  const dLatitude = (b.latitude - a.latitude) * radians;
  const dLongitude = (b.longitude - a.longitude) * radians;
  const h =
    Math.sin(dLatitude / 2) ** 2 +
    Math.cos(a.latitude * radians) *
      Math.cos(b.latitude * radians) *
      Math.sin(dLongitude / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(h));
}

/** The closest of `choices` to `from`, or undefined with no choices. */
export function nearestLocation(
  from: Point,
  choices: readonly Location[],
): Nearest | undefined {
  let nearest: Nearest | undefined;
  for (const location of choices) {
    const kilometres = distanceKm(from, location);
    if (nearest === undefined || kilometres < nearest.kilometres) {
      nearest = { location, kilometres };
    }
  }
  return nearest;
}

/** How far the station is, so a far one isn't taken for local. */
export function distanceText(kilometres: number): string {
  return kilometres < 1
    ? "less than 1\u00a0km"
    : `${String(Math.round(kilometres))}\u00a0km`;
}
