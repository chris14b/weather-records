import { describe, expect, test } from "vitest";
import { locations, type Location } from "../src/shared/locations.ts";
import {
  parseObservations,
  parseRunningValues,
} from "../src/pipeline/observations.ts";
import { fixture, observationsAt } from "./live-feeds.ts";

const [observatoryHill, airport, olympicPark] = locations as [
  Location,
  Location,
  Location,
];

const parse = (xml: string, location = observatoryHill) =>
  parseObservations(Buffer.from(xml), location);

describe("parseObservations", () => {
  test("at 2:30pm, gives the rain to 9am and the overnight minimum, but not the maximum so far", () => {
    const xml = fixture("IDN60920.xml");

    expect(parse(xml)).toEqual([
      {
        date: "2026-10-30",
        rain: 0,
        maxTemp: null,
        minTemp: 16.8,
        station: "066214",
      },
    ]);
    expect(parse(xml, airport)).toEqual([
      {
        date: "2026-10-30",
        rain: 0,
        maxTemp: null,
        minTemp: 17.9,
        station: "066037",
      },
    ]);
    expect(parse(xml, olympicPark)).toEqual([
      {
        date: "2026-10-30",
        rain: 0,
        maxTemp: null,
        minTemp: 16.3,
        station: "066212",
      },
    ]);
  });

  test.each([
    ["at 4pm", "2026-10-30T05:00:00+00:00"],
    ["once its window closes at 9pm", "2026-10-30T10:00:00+00:00"],
  ])("gives the maximum so far %s", (_, utc) => {
    expect(parse(observationsAt(utc))).toEqual([
      {
        date: "2026-10-30",
        rain: 0,
        maxTemp: 23.9,
        minTemp: 16.8,
        station: "066214",
      },
    ]);
  });

  test("leaves out the maximum before 4pm", () => {
    expect(parse(observationsAt("2026-10-30T04:59:00+00:00"))).toEqual([
      {
        date: "2026-10-30",
        rain: 0,
        maxTemp: null,
        minTemp: 16.8,
        station: "066214",
      },
    ]);
  });

  test("gives nothing before 9am, when every window is still open", () => {
    expect(parse(observationsAt("2026-10-29T21:30:00+00:00"))).toEqual([]);
  });

  test("leaves out a value the station doesn't report", () => {
    const xml = fixture("IDN60920.xml").replace(
      /\n.*type="rainfall_24hr">0\.0<\/element>/,
      "",
    );

    expect(parse(xml)).toEqual([
      {
        date: "2026-10-30",
        rain: null,
        maxTemp: null,
        minTemp: 16.8,
        station: "066214",
      },
    ]);
  });

  test.each([
    {
      problem: "the product has changed",
      edit: (xml: string) =>
        xml.replace("<identifier>IDN60920", "<identifier>IDN60921"),
      error: "expected the product IDN60920, found IDN60921",
    },
    {
      problem: "the station is missing",
      edit: (xml: string) => xml.replace('bom-id="066214"', 'bom-id="066999"'),
      error: "expected one station 066214, found 0",
    },
    {
      problem: "the station's name has changed",
      edit: (xml: string) =>
        xml.replace(
          'stn-name="SYDNEY (OBSERVATORY HILL)"',
          'stn-name="SYDNEY OBS HILL"',
        ),
      error:
        "expected stn-name SYDNEY (OBSERVATORY HILL), found SYDNEY OBS HILL",
    },
    {
      problem: "the location's name has changed",
      edit: (xml: string) =>
        xml.replace(
          'description="Sydney - Observatory Hill"',
          'description="Observatory Hill"',
        ),
      error:
        "expected description Sydney - Observatory Hill, found Observatory Hill",
    },
    {
      problem: "a window has changed",
      edit: (xml: string) =>
        xml.replace(
          'start-time-local="2026-10-30T06:00:00+11:00"',
          'start-time-local="2026-10-30T09:00:00+11:00"',
        ),
      error:
        "maximum_air_temperature: expected a window from 06:00 to 21:00, found 2026-10-30T09:00:00+11:00 to 2026-10-30T21:00:00+11:00",
    },
    {
      problem: "a value isn't a number",
      edit: (xml: string) =>
        xml.replace('type="rainfall_24hr">0.0<', 'type="rainfall_24hr">Tce<'),
      error: "rainfall_24hr: invalid value Tce",
    },
    {
      problem: "the file is cut short",
      edit: (xml: string) => xml.slice(0, xml.indexOf("</observations>")),
      error: "IDN60920.xml is not valid XML",
    },
  ])("fails when $problem", ({ edit, error }) => {
    expect(() => parse(edit(fixture("IDN60920.xml")))).toThrow(error);
  });
});

describe("parseRunningValues", () => {
  const running = (xml: string, location = observatoryHill) =>
    parseRunningValues(Buffer.from(xml), location);

  test("at 2:30pm, gives the maximum so far and the rain since 9am, credited to tomorrow", () => {
    expect(running(fixture("IDN60920.xml"))).toEqual([
      {
        measure: "maxTemp",
        date: "2026-10-30",
        value: 23.9,
        observedAt: "2026-10-30T03:30:00.000Z",
      },
      {
        measure: "rain",
        date: "2026-10-31",
        value: 0,
        observedAt: "2026-10-30T03:30:00.000Z",
      },
    ]);
  });

  test("before 9am, gives the minimum so far", () => {
    expect(running(observationsAt("2026-10-29T21:30:00+00:00"))).toContainEqual(
      {
        measure: "minTemp",
        date: "2026-10-30",
        value: 16.8,
        observedAt: "2026-10-29T21:30:00.000Z",
      },
    );
  });

  test("leaves out the maximum once its window closes at 9pm", () => {
    expect(
      running(observationsAt("2026-10-30T10:00:00+00:00")).map(
        ({ measure }) => measure,
      ),
    ).toEqual(["rain"]);
  });

  test("credits the rain since 9am yesterday to today", () => {
    const xml = fixture("IDN60920.xml").replace(
      'start-time-local="2026-10-30T09:00:00+11:00" end-time-local="2026-10-30T14:33:00+11:00" duration="333" start-time-utc="2026-10-29T22:00:00+00:00" end-time-utc="2026-10-30T03:33:00+00:00" units="mm" type="rainfall">0.0<',
      'start-time-local="2026-10-29T09:00:00+11:00" end-time-local="2026-10-30T08:33:00+11:00" duration="1413" start-time-utc="2026-10-28T22:00:00+00:00" end-time-utc="2026-10-29T21:33:00+00:00" units="mm" type="rainfall">4.2<',
    );

    expect(running(xml)).toContainEqual({
      measure: "rain",
      date: "2026-10-30",
      value: 4.2,
      observedAt: "2026-10-30T03:30:00.000Z",
    });
  });

  test("fails when the rain since 9am doesn't start at 9am", () => {
    const xml = fixture("IDN60920.xml").replace(
      'start-time-local="2026-10-30T09:00:00+11:00" end-time-local="2026-10-30T14:33:00+11:00"',
      'start-time-local="2026-10-30T12:00:00+11:00" end-time-local="2026-10-30T14:33:00+11:00"',
    );

    expect(() => running(xml)).toThrow(
      "rainfall: expected a window from 09:00 for up to a day, found 2026-10-30T12:00:00+11:00 to 2026-10-30T14:33:00+11:00",
    );
  });
});
