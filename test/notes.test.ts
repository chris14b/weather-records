import { describe, expect, test } from "vitest";
import { locationNotes } from "../src/site/notes.ts";

describe("locationNotes", () => {
  test("explains Observatory Hill's station change and why it has no wind", () => {
    const notes = locationNotes("sydney-observatory-hill");

    expect(notes).toHaveLength(2);
    expect(notes[0]).toMatch(/^Observatory Hill's records join two stations/);
    expect(notes[1]).toBe(
      "Observatory Hill has no wind instrument, so it has no wind records. BOM measures Sydney Harbour's wind at Fort Denison.",
    );
  });

  test.each(["sydney-airport", "sydney-olympic-park"])(
    "has nothing to say about %s",
    (locationId) => {
      expect(locationNotes(locationId)).toEqual([]);
    },
  );
});
