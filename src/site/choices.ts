import type { Location } from "../shared/locations.ts";

export interface LocationChoice {
  id: string;
  name: string;
  selected: boolean;
}

/** The locations by name, with the one shown marked, for the dropdown. */
export function locationChoices(
  all: readonly Location[],
  selectedId: string,
): LocationChoice[] {
  return all
    .map(({ id, name }) => ({ id, name, selected: id === selectedId }))
    .sort((a, b) => a.name.localeCompare(b.name, "en-AU"));
}
