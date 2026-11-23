import { expect, test } from "vitest";
import { locations, locationById } from "../src/shared/locations.ts";
import {
  distanceKm,
  nearestLocation,
  distanceText,
} from "../src/site/nearest.ts";

const dubbo = { latitude: -32.2569, longitude: 148.6011 };
const observatoryHill = locationById("sydney-observatory-hill");
const nobbys = locationById("newcastle-nobbys");

test("measures the distance between Observatory Hill and Nobbys", () => {
  expect(distanceKm(observatoryHill, nobbys)).toBeCloseTo(118, -1);
});

test("a point at a station is nearest to it, at no distance", () => {
  const nearest = nearestLocation(nobbys, locations);

  expect(nearest?.location.id).toBe("newcastle-nobbys");
  expect(nearest?.kilometres).toBe(0);
});

test("picks the closest station for someone far inland", () => {
  const nearest = nearestLocation(dubbo, locations);

  expect(nearest?.location.id).toBe("sydney-olympic-park");
  expect(nearest?.kilometres).toBeGreaterThan(200);
});

test("has no nearest with no locations", () => {
  expect(nearestLocation(dubbo, [])).toBeUndefined();
});

test("says how far the station is", () => {
  expect(distanceText(117.6)).toBe("118\u00a0km");
});

test("says less than 1 km for a station right here", () => {
  expect(distanceText(0.3)).toBe("less than 1\u00a0km");
});
