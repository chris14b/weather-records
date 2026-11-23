import type { Location } from "../shared/locations.ts";

export interface LocationChoice {
  id: string;
  name: string;
  selected: boolean;
}

/** The locations in order, with the one shown marked, for the toggle and the dropdown. */
export function locationChoices(
  all: readonly Location[],
  selectedId: string,
): LocationChoice[] {
  return all.map(({ id, name }) => ({ id, name, selected: id === selectedId }));
}
