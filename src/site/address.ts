import type { Location } from "../shared/locations.ts";

const parameter = "location";

/** The location to open with: the address's, then the remembered one, then the first. */
export function startingLocation(
  address: URL,
  rememberedId: string | null,
  choices: readonly Location[],
): Location {
  const named = (id: string | null) => choices.find((l) => l.id === id);
  const location =
    named(address.searchParams.get(parameter)) ??
    named(rememberedId) ??
    choices[0];
  if (location === undefined) throw new Error("No locations are configured");
  return location;
}

/** The address to open with: as given, less a location that isn't one of `choices`. */
export function startingAddress(
  address: URL,
  choices: readonly Location[],
): URL {
  const id = address.searchParams.get(parameter);
  if (id === null || choices.some((l) => l.id === id)) return address;
  const next = new URL(address);
  next.searchParams.delete(parameter);
  return next;
}

/** The same page's address, showing `location`. */
export function addressFor(address: URL, location: Location): URL {
  const next = new URL(address);
  next.searchParams.set(parameter, location.id);
  return next;
}
