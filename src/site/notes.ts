/** What the footer says about a location's records, one paragraph each. */
export function locationNotes(locationId: string): string[] {
  if (locationId !== "sydney-observatory-hill") return [];
  return [
    "Observatory Hill's records join two stations: 066062 until 31 August 2020, then 066214. The new station reads about 0.3 °C warmer for maximums and 0.3 °C cooler for minimums, so records that span the change are less exact.",
    "Observatory Hill has no wind instrument, so it has no wind records. BOM measures Sydney Harbour's wind at Fort Denison.",
  ];
}
