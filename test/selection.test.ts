import { describe, expect, test } from "vitest";
import { generateCandidates } from "../src/pipeline/candidates.ts";
import { generateDailyFacts } from "../src/pipeline/daily-facts.ts";
import { addDays, daysBetween } from "../src/pipeline/dates.ts";
import { readSavedSeries } from "../src/pipeline/saved-series.ts";
import {
  type SelectionRequest,
  selectFacts,
} from "../src/pipeline/selection.ts";
import type { ForecastDay } from "../src/pipeline/forecast.ts";
import { changeSeries, type Series } from "../src/pipeline/series.ts";
import type {
  Fact,
  FactMeasure,
  PageFacts,
  RecordFact,
} from "../src/shared/facts.ts";
import {
  type Location,
  locations,
  stationOffsets,
} from "../src/shared/locations.ts";

const latest = "2026-11-06";

type Sections = Omit<PageFacts, "date">;

/** The facts chosen without any daylight, so every one is a record fact. */
function selectRecords(request: SelectionRequest): {
  [Section in keyof Sections]: RecordFact[];
} & Pick<PageFacts, "date"> {
  const selected = selectFacts(request);
  const records = (facts: readonly Fact[]) =>
    facts.map((fact) => {
      if (fact.kind !== "record") throw new Error("Unexpected daylight fact");
      return fact;
    });
  return {
    date: selected.date,
    today: records(selected.today),
    pastWeek: records(selected.pastWeek),
    pastMonth: records(selected.pastMonth),
    comingWeek: records(selected.comingWeek),
  };
}

/** Every day from `from` to `latest` at `baseline`, except the days given. */
function series<Measure extends FactMeasure>(
  measure: Measure,
  baseline: (date: string) => number,
  values: Readonly<Record<string, number>>,
  from = "2016-01-01",
): Series<Measure> {
  const days = Array.from(
    { length: daysBetween(from, latest) + 1 },
    (_, index) => {
      const date = addDays(from, index);
      return {
        date,
        value: values[date] ?? baseline(date),
        status: "confirmed" as const,
      };
    },
  );
  return { measure, days, fullRecord: true };
}

const maxTemps = {
  "2026-10-17": 24,
  "2026-11-03": 25,
  "2026-11-04": 26,
  "2026-11-06": 30,
};
// A wet 15th of every month keeps small falls far from the top ranks.
const rain = series("rain", (date) => (date.endsWith("-15") ? 100 : 0), {
  "2026-10-27": 5,
  "2026-11-03": 4,
  "2026-11-04": 150,
  "2026-11-06": 200,
});
const allSeries = [
  series("maxTemp", () => 20, maxTemps),
  series("temp3pm", () => 20, maxTemps),
  rain,
];
const facts = generateDailyFacts({
  locationId: "test",
  series: allSeries,
  windowEnd: latest,
});
const selected = selectRecords({ date: latest, facts, series: allSeries });

const summary = (facts: readonly RecordFact[]) =>
  facts.map(({ date, measure, text }) => ({ date, measure, text }));

function selectAll(allSeries: readonly Series[]) {
  return selectRecords({
    date: latest,
    facts: generateCandidates({
      locationId: "test",
      series: allSeries,
      windowEnd: latest,
    }),
    series: allSeries,
  });
}

const wetFifteenth = (date: string) => (date.endsWith("-15") ? 100 : 0);

describe("selectFacts", () => {
  test("puts the page's day's strongest facts in Today", () => {
    expect(selected.date).toBe(latest);
    expect(summary(selected.today)).toEqual([
      {
        date: "2026-11-06",
        measure: "maxTemp",
        text: "the hottest day since records began in 2016",
      },
      {
        date: "2026-11-06",
        measure: "rain",
        text: "the wettest since records began in 2016",
      },
    ]);
  });

  test("leaves out the facts that a later day beat", () => {
    expect(selected.pastWeek).toEqual([]);
    expect(selected.pastMonth).toEqual([]);
  });

  test("keeps the strongest of a day's facts about the same family of measures and direction", () => {
    const [hottest] = selected.today;

    expect(hottest).toMatchObject({
      measure: "maxTemp",
      direction: "highest",
      comparison: "all",
      status: "confirmed",
      lead: "rank",
    });
    expect(hottest?.score).toBeCloseTo(
      Math.log(3963) * Math.cbrt(10.85 / 30),
      1,
    );
  });

  test("explains a fact with its value, the previous record and the leaders", () => {
    const why = selected.today[0]?.why;

    expect(why).toMatchObject({
      value: 30,
      rank: 1,
      ties: 0,
      compared: 3963,
      recordStart: "2016-01-01",
      fullRecord: true,
      missingDays: 0,
      gaps: [],
      record: { date: "2026-11-04", value: 26 },
      since: null,
    });
    expect(why?.leaders).toEqual([
      { date: "2026-11-06", value: 30, rank: 1 },
      { date: "2026-11-04", value: 26, rank: 2 },
      { date: "2026-11-03", value: 25, rank: 3 },
      { date: "2026-10-17", value: 24, rank: 4 },
      ...["01", "02", "03", "04", "05", "06"].map((day) => ({
        date: `2016-01-${day}`,
        value: 20,
        rank: 5,
      })),
    ]);
  });

  test("keeps one change in temperature per day, apart from the day's other temperature facts", () => {
    const max = series("maxTemp", () => 25, {
      "2026-11-05": 35,
      "2026-11-06": 15,
    });
    const min = series("minTemp", () => 15, {
      "2026-11-05": 18,
      "2026-11-06": 8,
    });
    const coldChange = [max, changeSeries(max), changeSeries(min)];

    const { today } = selectRecords({
      date: latest,
      facts: generateDailyFacts({
        locationId: "test",
        series: coldChange,
        windowEnd: latest,
      }),
      series: coldChange,
    });

    expect(
      today
        .filter(({ date }) => date === latest)
        .map(({ measure, text }) => ({ measure, text })),
    ).toEqual([
      {
        measure: "maxTemp",
        text: "the coldest day since records began in 2016",
      },
      {
        measure: "maxTempChange",
        text: "the biggest day-to-day drop in maximum temperature since records began in 2016",
      },
    ]);
  });

  test("moves yesterday's maximum to Past week once the night after it is in", () => {
    const yesterday = addDays(latest, -1);
    const hotDay = [
      series("maxTemp", () => 20, { [yesterday]: 35 }),
      series("minTemp", () => 10, { [yesterday]: 25 }),
    ];

    const { today, pastWeek } = selectAll(hotDay);

    expect(today.filter(({ date }) => date === yesterday)).toEqual([]);
    expect(pastWeek.map(({ date, measure }) => ({ date, measure }))).toEqual(
      expect.arrayContaining([
        { date: yesterday, measure: "maxTemp" },
        { date: yesterday, measure: "minTemp" },
      ]),
    );
  });

  test("turns the page over at midnight, keeping the day's maximum in Today", () => {
    const tomorrow = selectRecords({
      date: addDays(latest, 1),
      facts,
      series: allSeries,
    });

    expect(tomorrow.date).toBe("2026-11-07");
    expect(summary(tomorrow.today)).toEqual([
      {
        date: latest,
        measure: "maxTemp",
        text: "the hottest day since records began in 2016",
      },
    ]);
    expect(summary(tomorrow.pastWeek)).toEqual([
      {
        date: latest,
        measure: "rain",
        text: "the wettest since records began in 2016",
      },
    ]);
  });

  test("lets a spell of rain stand for the weaker days and spells inside it", () => {
    const { pastWeek } = selectAll([
      series("maxTemp", () => 20, { "2026-11-06": 30 }),
      series("rain", wetFifteenth, {
        "2026-11-01": 30,
        "2026-11-02": 60,
        "2026-11-03": 80,
        "2026-11-04": 150,
      }),
    ]);

    expect(
      pastWeek
        .filter(({ measure }) => measure === "rain")
        .map(({ from, date, period, text }) => ({ from, date, period, text })),
    ).toEqual([
      {
        from: "2026-11-04",
        date: "2026-11-04",
        period: { kind: "day" },
        text: "the wettest since records began in 2016",
      },
      {
        from: "2026-11-02",
        date: "2026-11-04",
        period: { kind: "rolling", days: 3 },
        text: "the wettest since records began in 2016",
      },
    ]);
  });

  test("adds the latest calendar periods to Past month without crowding out its days", () => {
    const { pastMonth } = selectAll([
      series("maxTemp", () => 20, { "2026-11-06": 30 }),
      series(
        "rain",
        (date) => wetFifteenth(date) || (date.startsWith("2026-10") ? 5 : 1),
        { "2026-10-10": 300 },
      ),
    ]);

    expect(
      pastMonth.map(({ from, date, text }) => ({ from, date, text })),
    ).toEqual([
      {
        from: "2026-10-10",
        date: "2026-10-10",
        text: "the wettest since records began in 2016",
      },
      {
        from: "2026-10-01",
        date: "2026-10-31",
        text: "the wettest month since records began in 2016",
      },
      {
        from: "2026-01-01",
        date: "2026-11-06",
        text: "so far the wettest year since records began in 2016",
      },
      {
        from: "2026-09-01",
        date: "2026-11-06",
        text: "the hottest since records began in 2016",
      },
    ]);
  });

  describe("over a short record", () => {
    // Only the year so far stands out: no 2026 month, season or day beats an earlier one.
    const hotStart = (hotYear: string, otherHotYear?: string) =>
      series(
        "maxTemp",
        (date) => {
          const isHotStart = (year: string) =>
            date >= `${year}-01-01` && date <= `${year}-02-28`;
          if (isHotStart(hotYear)) return 30;
          return otherHotYear !== undefined && isHotStart(otherHotYear)
            ? 31
            : 20;
        },
        {},
      );

    test("shows an all-time record however little it scores", () => {
      const { pastMonth } = selectAll([hotStart("2026")]);

      expect(pastMonth.map(({ text, score }) => ({ text, score }))).toEqual([
        {
          text: "so far the hottest year since records began in 2016",
          score: expect.any(Number) as number,
        },
      ]);
      expect(pastMonth[0]?.score).toBeLessThan(3);
    });

    test("leaves out a lesser rank that scores too little", () => {
      expect(selectAll([hotStart("2026", "2020")]).pastMonth).toEqual([]);
    });
  });

  test("has empty sections when there are no facts", () => {
    expect(selectFacts({ date: latest, facts: [], series: [] })).toEqual({
      date: latest,
      today: [],
      pastWeek: [],
      pastMonth: [],
      comingWeek: [],
    });
  });
});

describe("selectFacts with a forecast", () => {
  const forecastDays = (
    maxTemp: number,
    later: Readonly<Record<number, number>> = {},
  ): ForecastDay[] =>
    Array.from({ length: 7 }, (_, index) => ({
      date: addDays(latest, index + 1),
      minTemp: 15,
      maxTemp: index === 1 ? maxTemp : (later[index] ?? 20),
      rainChance: 0,
      rain50: null,
      rain25: null,
      iconCode: null,
      precis: null,
    }));

  function selectWithForecast(
    values: Readonly<Record<string, number>>,
    maxTemp: number,
    date = latest,
    later: Readonly<Record<number, number>> = {},
  ) {
    const allSeries = [
      series(
        "maxTemp",
        (date) => 15 + (Number(date.slice(8)) % 10),
        { ...values, [latest]: 30 },
        "1990-01-01",
      ),
    ];
    const forecast = {
      days: forecastDays(maxTemp, later),
      from: addDays(latest, 1),
    };
    return selectRecords({
      date,
      facts: generateCandidates({
        locationId: "test",
        series: allSeries,
        windowEnd: latest,
        forecast,
      }),
      series: allSeries,
      forecast,
    });
  }

  const nearRecord = selectWithForecast(
    { "2019-01-10": 36.5, "2021-01-10": 35.5 },
    35,
  );

  test("puts the forecast's facts in the coming week, soonest first, and what it would take after them", () => {
    expect(
      nearRecord.comingWeek.map(({ date, status, text }) => ({
        date,
        status,
        text,
      })),
    ).toEqual([
      {
        date: "2026-11-08",
        status: "forecast",
        text: "the third hottest day since records began in 1990",
      },
      {
        date: "2026-11-08",
        status: "conditional",
        text: "the hottest day since records began in 1990",
      },
    ]);
  });

  test("shows the best forecast fact when the coming days have nothing notable", () => {
    const { comingWeek } = selectWithForecast({}, 20);

    expect(
      comingWeek.map(({ date, status, score, text }) => ({
        date,
        status,
        score,
        text,
      })),
    ).toEqual([
      {
        date: "2026-11-07",
        status: "forecast",
        score: 2.89,
        text: "the coldest 7\u00a0November since records began in 1990",
      },
    ]);
  });

  test("puts the forecast for the observation day under way in Today", () => {
    const { today, comingWeek } = selectWithForecast(
      { "2019-01-10": 36.5, "2021-01-10": 35.5 },
      35,
      "2026-11-08",
    );

    expect(
      today.map(({ date, status, text }) => ({ date, status, text })),
    ).toEqual([
      {
        date: "2026-11-08",
        status: "forecast",
        text: "the third hottest day since records began in 1990",
      },
      {
        date: "2026-11-08",
        status: "conditional",
        text: "the hottest day since records began in 1990",
      },
    ]);
    expect(comingWeek.map(({ date }) => date)).not.toContain("2026-11-08");
  });

  test("leaves out the forecast for an observation day that has ended", () => {
    const { today, comingWeek } = selectWithForecast(
      { "2019-01-10": 36.5, "2021-01-10": 35.5 },
      35,
      "2026-11-09",
    );

    expect([...today, ...comingWeek].map(({ date }) => date)).not.toContain(
      "2026-11-08",
    );
  });

  describe("with tonight's low and the rain to 9 am tomorrow", () => {
    const observed = [
      series("minTemp", () => 15, {}),
      series("rain", wetFifteenth, {}),
    ];
    const days = Array.from({ length: 7 }, (_, index) => ({
      date: addDays(latest, index),
      minTemp: index === 1 ? 2 : 15,
      maxTemp: 20,
      rainChance: 90,
      rain50: index === 0 ? 120 : 1,
      rain25: index === 0 ? 150 : 2,
      iconCode: null,
      precis: null,
    }));
    const forecast = { days, from: latest };
    const facts = generateCandidates({
      locationId: "test",
      series: observed,
      windowEnd: latest,
      forecast,
    });
    const tonight = (date: string) =>
      selectRecords({ date, facts, series: observed, forecast });
    const forecasts = (page: ReturnType<typeof tonight>) =>
      summary(page.today.filter(({ status }) => status === "forecast"));

    test("puts them in Today", () => {
      const page = tonight(latest);

      expect(forecasts(page)).toEqual(
        expect.arrayContaining([
          {
            date: "2026-11-07",
            measure: "minTemp",
            text: "the coldest since records began in 2016",
          },
          {
            date: "2026-11-07",
            measure: "rain",
            text: "the wettest since records began in 2016",
          },
        ]),
      );
      expect(page.comingWeek.every(({ date }) => date > "2026-11-07")).toBe(
        true,
      );
    });

    test("keeps the night under way in Today after midnight", () => {
      expect(forecasts(tonight("2026-11-07"))).toContainEqual({
        date: "2026-11-07",
        measure: "minTemp",
        text: "the coldest since records began in 2016",
      });
    });
  });

  test("keeps the coming days' forecasts out of Today", () => {
    expect(summary(nearRecord.today)).toEqual([
      {
        date: latest,
        measure: "maxTemp",
        text: "the third hottest day since records began in 1990",
      },
    ]);
  });

  test("explains a conditional fact with the forecast and the value it needs", () => {
    const why = nearRecord.comingWeek[1]?.why;

    expect(why).toMatchObject({ value: 36.6, forecast: 35, rank: 1 });
    expect(why?.leaders.slice(0, 3)).toEqual([
      { date: "2026-11-08", value: 36.6, rank: 1 },
      { date: "2019-01-10", value: 36.5, rank: 2 },
      { date: "2021-01-10", value: 35.5, rank: 3 },
    ]);
    expect(nearRecord.comingWeek[0]?.why.leaders[2]).toEqual({
      date: "2026-11-08",
      value: 35,
      rank: 3,
    });
  });

  test("leaves out what it would take when that is not much rarer than the forecast", () => {
    const { comingWeek } = selectWithForecast(
      { "2000-01-10": 35.5, "2022-01-10": 37.5 },
      35,
    );

    expect(comingWeek.map(({ status }) => status)).toEqual(["forecast"]);
  });

  test("leaves out what it would take when another day's forecast already gets it", () => {
    const { comingWeek } = selectWithForecast(
      { "2019-01-10": 36.5, "2021-01-10": 35.5 },
      37,
      latest,
      { 3: 35.5 },
    );

    expect(
      comingWeek.map(({ date, status, text }) => ({ date, status, text })),
    ).toEqual([
      {
        date: "2026-11-08",
        status: "forecast",
        text: "the hottest day since records began in 1990",
      },
      {
        date: "2026-11-10",
        status: "forecast",
        text: "the equal third hottest day since records began in 1990",
      },
    ]);
  });
});

describe("selectFacts on real data", () => {
  /** Each run adds data that can beat these days, so the snapshots stop at a fixed day. */
  const dataEnd = "2026-11-08";
  const savedSeriesTo = async (location: Location) =>
    (await readSavedSeries(location)).map((series) => ({
      ...series,
      days: series.days.filter(({ date }) => date <= dataEnd),
      ...(series.multiDay && {
        multiDay: series.multiDay.filter(({ date }) => date <= dataEnd),
      }),
    }));

  const sections = (facts: ReturnType<typeof selectRecords>) =>
    Object.fromEntries(
      (["today", "pastWeek", "pastMonth"] as const).map((section) => [
        section,
        facts[section].map(({ from, date, score, measure, text }) =>
          [
            from === date ? date : `${from}..${date}`,
            score.toFixed(2),
            measure,
            text,
          ].join(" "),
        ),
      ]),
    );

  test.each([
    ["sydney-observatory-hill", "2013-01-18"],
    ["sydney-observatory-hill", "1986-08-08"],
    ["sydney-observatory-hill", "2026-10-13"],
    ["sydney-airport", "2026-10-29"],
    ["sydney-olympic-park", "2020-02-12"],
  ])(
    "chooses the facts at %s for the 31 days to %s",
    async (id, windowEnd) => {
      const location = locations.find((l) => l.id === id);
      if (location === undefined) throw new Error(`No location ${id}`);
      const locationSeries = await savedSeriesTo(location);

      const facts = selectRecords({
        date: windowEnd,
        facts: generateCandidates({
          locationId: id,
          series: locationSeries,
          windowEnd,
          offsets: stationOffsets(location),
        }),
        series: locationSeries,
      });

      expect(sections(facts)).toMatchSnapshot();
    },
    30_000,
  );
});
