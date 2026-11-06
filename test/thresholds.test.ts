import { describe, expect, test } from "vitest";
import { boundariesBetween, justBeyond } from "../src/pipeline/thresholds.ts";

describe("boundariesBetween", () => {
  const values = [30, 33.5, 31, 31, 35, 29];

  test("gives the values a higher one would beat on the way, nearest first, once each", () => {
    expect(boundariesBetween(values, 31, 34, "highest")).toEqual([31, 33.5]);
  });

  test("gives the values a lower one would beat on the way", () => {
    expect(boundariesBetween(values, 31, 28, "lowest")).toEqual([31, 30, 29]);
  });

  test("leaves out a value only reached, not beaten", () => {
    expect(boundariesBetween(values, 32, 35, "highest")).toEqual([33.5]);
  });

  test("is empty when nothing lies between", () => {
    expect(boundariesBetween(values, 36, 38, "highest")).toEqual([]);
  });
});

describe("justBeyond", () => {
  test.each([
    [33.5, "highest", 33.6],
    [33.5, "lowest", 33.4],
    [0.2, "highest", 0.3],
    [-0.1, "highest", 0],
  ] as const)("beats %d going %s with %d", (value, direction, expected) => {
    expect(justBeyond(value, direction)).toBe(expected);
  });
});
