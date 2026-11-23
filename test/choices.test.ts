import { expect, test } from "vitest";
import { locations } from "../src/shared/locations.ts";
import { locationChoices } from "../src/site/choices.ts";

test("lists every location by name, with only the one shown selected", () => {
  const choices = locationChoices(locations, "norah-head");

  const names = choices.map(({ name }) => name);
  expect(names).toEqual(names.toSorted((a, b) => a.localeCompare(b, "en-AU")));
  expect(names.toSorted()).toEqual(
    locations.map(({ name }) => name).toSorted(),
  );
  expect(choices.filter(({ selected }) => selected)).toEqual([
    { id: "norah-head", name: "Norah Head", selected: true },
  ]);
});

test("selects none for an id that isn't a location", () => {
  expect(
    locationChoices(locations, "bondi").some(({ selected }) => selected),
  ).toBe(false);
});
