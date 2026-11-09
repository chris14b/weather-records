import { describe, expect, test } from "vitest";
import {
  type DaylightCandidate,
  daylightAround,
  generateDaylightFacts,
} from "../src/pipeline/daylight-facts.ts";
import { scoreDaylight } from "../src/pipeline/scoring.ts";
import { selectFacts } from "../src/pipeline/selection.ts";
import { describeDaylight } from "../src/pipeline/wording.ts";
import { locationById } from "../src/shared/locations.ts";
import { dailyFact } from "./facts.ts";

const observatoryHill = locationById("sydney-observatory-hill");

const sydneyTime = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

describe("generateDaylightFacts", () => {
  const year = generateDaylightFacts({
    place: observatoryHill,
    from: "2026-01-01",
    to: "2026-12-31",
  });

  // On the clock, the sunrises just before daylight saving starts in October are earlier
  // than December's, and those just before it ends in April later than July's.
  test("finds each of the year's six turning points once, scoping sunrises to their season", () => {
    expect(year.map(({ date, event, scope }) => [date, event, scope])).toEqual([
      ["2026-01-07", "latestSunset", "year"],
      ["2026-06-12", "earliestSunset", "year"],
      ["2026-06-21", "shortestDay", "year"],
      ["2026-06-30", "latestSunrise", "season"],
      ["2026-12-06", "earliestSunrise", "season"],
      ["2026-12-22", "longestDay", "year"],
    ]);
  });

  test("rounds the day's sunrise and sunset to the minute", () => {
    const longest = year.find(({ event }) => event === "longestDay");

    expect(longest && sydneyTime.format(longest.sunrise)).toBe("05:41");
    expect(longest && sydneyTime.format(longest.sunset)).toBe("20:06");
  });

  test("finds only the turning points in the dates asked for", () => {
    expect(
      generateDaylightFacts({
        place: observatoryHill,
        from: "2026-06-13",
        to: "2026-06-29",
      }).map(({ event }) => event),
    ).toEqual(["shortestDay"]);
  });

  test("reaches from 30 days before the window's end to a week after it", () => {
    expect(
      daylightAround(observatoryHill, "2026-12-15").map(({ date }) => date),
    ).toEqual(["2026-12-06", "2026-12-22"]);
  });
});

const candidate = (
  changes: Partial<DaylightCandidate> = {},
): DaylightCandidate => ({
  date: "2026-12-22",
  event: "longestDay",
  scope: "year",
  sunrise: new Date("2026-12-21T18:41:00Z"),
  sunset: new Date("2026-12-22T09:06:00Z"),
  ...changes,
});

describe("scoreDaylight", () => {
  test("scores a solstice as one of the year's six turning points", () => {
    expect(scoreDaylight(candidate())).toBeCloseTo(Math.log(365.25 / 6));
  });

  test("scores a sunrise or sunset less, and less again for only its season", () => {
    const sunrise = scoreDaylight(candidate({ event: "earliestSunrise" }));
    const seasonal = scoreDaylight(
      candidate({ event: "earliestSunrise", scope: "season" }),
    );

    expect(sunrise).toBeLessThan(scoreDaylight(candidate()));
    expect(seasonal).toBeLessThan(sunrise);
  });
});

describe("describeDaylight", () => {
  test.each([
    [candidate(), "the longest day of the year"],
    [
      candidate({
        date: "2026-06-30",
        event: "latestSunrise",
        scope: "season",
      }),
      "the latest sunrise of winter",
    ],
    [
      candidate({
        date: "2026-12-06",
        event: "earliestSunrise",
        scope: "season",
      }),
      "the earliest sunrise of summer",
    ],
    [
      candidate({ date: "2027-01-07", event: "latestSunset" }),
      "the latest sunset of the year",
    ],
  ])("words %o as %s", (fact, expected) => {
    expect(describeDaylight(fact)).toBe(expected);
  });
});

describe("selectFacts with daylight", () => {
  const select = (latest: string, daylight: readonly DaylightCandidate[]) =>
    selectFacts({
      date: latest,
      facts: [dailyFact({ date: latest })],
      series: [],
      daylight,
    });

  test("puts a turning point on the latest day in Today, beside its weather", () => {
    const { today } = select("2026-12-22", [candidate()]);

    expect(today.map(({ kind }) => kind)).toEqual(["record", "daylight"]);
    expect(today[1]).toEqual({
      kind: "daylight",
      date: "2026-12-22",
      event: "longestDay",
      scope: "year",
      sunrise: "2026-12-21T18:41:00.000Z",
      sunset: "2026-12-22T09:06:00.000Z",
      score: 4.11,
      text: "the longest day of the year",
    });
  });

  test("puts the week before in Past week, and the days after in Coming week", () => {
    const sections = select("2026-12-20", [
      candidate({ date: "2026-12-14", event: "earliestSunrise" }),
      candidate({ date: "2026-12-22" }),
    ]);

    expect(sections.pastWeek.map(({ date }) => date)).toEqual(["2026-12-14"]);
    expect(sections.comingWeek.map(({ date }) => date)).toEqual(["2026-12-22"]);
  });

  test("leaves out a turning point more than a week ago", () => {
    const sections = select("2026-12-20", [
      candidate({ date: "2026-12-06", event: "earliestSunrise" }),
    ]);

    expect(
      [
        ...sections.today,
        ...sections.pastWeek,
        ...sections.pastMonth,
        ...sections.comingWeek,
      ].filter(({ kind }) => kind === "daylight"),
    ).toEqual([]);
  });
});
