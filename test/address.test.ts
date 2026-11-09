import { describe, expect, test } from "vitest";
import { locations } from "../src/shared/locations.ts";
import {
  addressFor,
  startingAddress,
  startingLocation,
} from "../src/site/address.ts";

const page = "https://chris14b.github.io/weather-records/";
const at = (query: string) => new URL(`${page}${query}`);

describe("startingLocation", () => {
  test("opens the location the address names", () => {
    expect(
      startingLocation(at("?location=sydney-airport"), null, locations).id,
    ).toBe("sydney-airport");
  });

  test("prefers the address over the remembered location", () => {
    expect(
      startingLocation(
        at("?location=sydney-airport"),
        "sydney-olympic-park",
        locations,
      ).id,
    ).toBe("sydney-airport");
  });

  test("opens the remembered location when the address names none", () => {
    expect(startingLocation(at(""), "sydney-olympic-park", locations).id).toBe(
      "sydney-olympic-park",
    );
  });

  test("treats an unknown location in the address as none", () => {
    expect(
      startingLocation(at("?location=bondi"), "sydney-airport", locations).id,
    ).toBe("sydney-airport");
  });

  test.each([
    ["no remembered location", null],
    ["an unknown remembered location", "bondi"],
  ])("falls back to the first location with %s", (_, remembered) => {
    expect(startingLocation(at("?location=bondi"), remembered, locations)).toBe(
      locations[0],
    );
  });

  test("throws when there are no locations", () => {
    expect(() => startingLocation(at(""), null, [])).toThrow(
      "No locations are configured",
    );
  });
});

describe("startingAddress", () => {
  test.each(["", "?location=sydney-airport", "?sky"])(
    "leaves %j as it is",
    (query) => {
      const address = at(query);
      expect(startingAddress(address, locations)).toBe(address);
    },
  );

  test("drops an unknown location, leaving no query", () => {
    expect(startingAddress(at("?location=bondi"), locations).href).toBe(page);
  });

  test("drops an unknown location but keeps other parameters", () => {
    const address = startingAddress(at("?location=bondi&sky=1"), locations);
    expect(address.searchParams.has("location")).toBe(false);
    expect(address.searchParams.get("sky")).toBe("1");
  });
});

describe("addressFor", () => {
  const airport = locations.find((l) => l.id === "sydney-airport");
  if (airport === undefined) throw new Error("Sydney Airport isn't configured");

  test("adds the location under the site's base path", () => {
    expect(addressFor(at(""), airport).href).toBe(
      `${page}?location=sydney-airport`,
    );
  });

  test("replaces the location already there", () => {
    expect(
      addressFor(at("?location=sydney-olympic-park"), airport).search,
    ).toBe("?location=sydney-airport");
  });

  test("keeps other parameters and the hash", () => {
    const address = addressFor(at("?sky=1#today"), airport);
    expect(address.searchParams.get("sky")).toBe("1");
    expect(address.hash).toBe("#today");
  });

  test("reads back as the location it was given", () => {
    for (const location of locations) {
      expect(
        startingLocation(addressFor(at(""), location), null, locations),
      ).toBe(location);
    }
  });
});
