import { expect, test } from "vitest";
import { locations } from "../src/shared/locations.ts";
import { locationChoices } from "../src/site/choices.ts";

test("lists every location in order, with only the one shown selected", () => {
  const choices = locationChoices(locations, "norah-head");

  expect(choices.map(({ id }) => id)).toEqual(locations.map(({ id }) => id));
  expect(choices.filter(({ selected }) => selected)).toEqual([
    { id: "norah-head", name: "Norah Head", selected: true },
  ]);
});

test("selects none for an id that isn't a location", () => {
  expect(
    locationChoices(locations, "bondi").some(({ selected }) => selected),
  ).toBe(false);
});
