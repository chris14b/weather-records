# How facts are made

This explains how the pipeline turns a location's daily data into the few facts on its home page, and why. The code is the source of truth for the numbers. The constants named here are where to change them.

There are four steps:

1. Build one **series** per measure.
2. **Rank** every recent day against the comparable days before it (`daily-facts.ts`).
3. **Score** each ranking by how unusual it is (`scoring.ts`).
4. **Select** the best for each section, and **word** them (`selection.ts`, `wording.ts`).

## 1. Series

A series is one measure's single-day values for a location, in date order (`series.ts`). There are 11:

| Measure                                        | From                                            | Starts                      |
| ---------------------------------------------- | ----------------------------------------------- | --------------------------- |
| `maxTemp`, `minTemp`, `rain`                   | ZIPs, then FTP daily files, then live snapshots | when records began          |
| `range` (max minus min)                        | the two series above, on days with both         | when records began          |
| `maxRelHum`, `minRelHum`, `solar`              | FTP history (`data/ftp-history/`)               | 2009 (2011 at Olympic Park) |
| `temp9am`, `relHum9am`, `temp3pm`, `relHum3pm` | saved readings (`data/recent/readings/`)        | when saving began           |

- A series whose history goes back to when records began has `fullRecord` set. Only those may say "on record"; the others say "since 2009" and so on.
- Missing days are simply absent. Nothing is filled in, and nothing is counted through a gap.
- A multi-day rain or temperature total is left out, so the days it covers count as missing. A ZIP value with a blank period counts as a single day only on a series' first day or after a day with a value. Otherwise it probably is an accumulation, and is left out too.
- A value from a live snapshot is `provisional`. Everything else is `confirmed`. A range is provisional if either its max or its min is.

## 2. Ranking

`generateDailyFacts` looks at every day in the window: the 31 days to today, by default. For each day that has a value, it makes a candidate fact for every combination of:

- **Measure:** each series.
- **Direction:** `highest` and `lowest`. Rain has only `highest`, and a dry day gets no facts at all, or every dry day would be "the equal wettest" of something.
- **Comparison:** which days count as comparable.
  - `all`: every day.
  - `year`: the days of the same year so far.
  - `season`: the days of the same season in every year. Seasons are meteorological, so December is summer.
  - `month`: the days of the same month in every year.
  - `calendarDate`: the same date in every year.

That's a few thousand candidates per location. Each is judged only against the comparable days **up to and including** its own date, so a day keeps the rank it had at the time. Each candidate records:

- `rank`: 1 plus the number of earlier comparable days that beat it. Tied values share a rank.
- `ties`: earlier comparable days with exactly the same value. A non-zero value means "equal".
- `compared`: the comparable days with a value, including this one.
- `since`: the most recent earlier comparable day that matched or beat it. It is null for an outright record.
- `comparedSince`: the comparable days with a value after `since`, including this one.
- `beatenBy`: the first later comparable day in the window that strictly beat it. A later day that only equals it doesn't count.
- `missingDays` and `gaps`: the comparable days with no value, and the runs of at least 7 missing days that include a comparable day.

For example, if the maximums so far are 30, 35, 28, 33, then the 33 is the 2nd highest of 4. Its since is the 35, and its `comparedSince` is 2.

## 3. Scoring

### The idea

Every score is the log of "how many comparable days pass for each fact like this one":

- **A rank:** a day is at least as extreme as the top `r` of `n` days about `r / n` of the time. So a rank scores `log(n / r)`. Here `r` is `rank + ties`, so being one of 300 days at 100% humidity is worth nothing.
- **A since:** a day is the most extreme of the last `m` comparable days about `1 / m` of the time. So a since scores `log(m)`, where `m` is `comparedSince`.

The two are on the same scale. A fact takes the larger, and its wording **leads** with that one. For scale, a once-a-year fact among all days scores about log(365), or 5.9. A once-a-week fact scores about log(7), or 1.9.

### Adjustments

These keep ranks easy to set from scoring too high:

- **Rank limit:** a rank scores 0 if `rank + ties` is above 10 (`lowestRank`), because "the 23rd hottest" isn't worth saying. A calendar date scores only at rank 1.
- **Short records:** a rank is multiplied by the cube root of (years of record / 30), capped at 1 (`fullStrengthYears`). This doesn't apply to the year so far. Olympic Park's 15 years give 0.79.
- **Missing days:** a rank is multiplied by the share of comparable days that have a value. The missing days might have held something better.
- **Sinces that don't count:** there is no since score for `year`, because its since is always the same day as the `all` since. There is none for `calendarDate`, and none when a gap falls after the since day, since the gap might have held a day that matched it.
- **Comparison weight:** all 1, season 0.85, month 0.8, year 0.75, calendar date 0.6 (`comparisonWeights`). Narrow comparisons give many more chances to set a record, and are less interesting to read.
- **Measure weight:** 1 for temperature and rain, down to 0.75 for 9am and 3pm humidity (`measureWeights`).

### Worked examples

- **2013-01-18 at Observatory Hill**, 45.8°C: the highest of 55,916 days, with 349 missing. That gives log(55,916) × 1 for the record length × 0.994 for coverage, which is **10.86**. It leads with the rank: "the hottest day on record".
- **2026-10-13 at Observatory Hill**, a 1.3°C range: only 148th smallest of all days, so the rank scores 0. But no day since 8 February matched it, about 247 comparable days. That gives log(247) × 0.9 for the range weight, which is **4.95**. It leads with the since: "the smallest temperature range since 8 February".

## 4. Selection

`selectFacts` scores every candidate. For each date, it keeps only the strongest fact per **family** and direction, because related measures say much the same thing. That also leaves one comparison per measure: "hottest this month" and "hottest this year" aren't both shown. The families are:

- max and 3pm temperature
- min and 9am temperature
- rain
- range
- humidity (all four)
- solar

It then fills the sections, counting back from the latest day that has any fact (`sectionRules`):

| Section    | Days before the latest | Per day | In all | First fact needs | Further facts need |
| ---------- | ---------------------- | ------- | ------ | ---------------- | ------------------ |
| Today      | 0                      | 3       | 3      | 1.75             | 2.5                |
| This week  | 1–6                    | 2       | 12     | 1.75             | 3.5                |
| This month | 7–30                   | 1       | 5      | 5                | —                  |

A score of 1.75 is a since of about 6 days, so "the warmest day since last Tuesday" can show in the last week. Older days need about a once-a-year fact. Each list runs latest first, then by score.

## 5. Wording

`describeFact` writes what the day was, without naming the day: e.g. "the 2nd hottest October day on record". The site adds "Today" or "Last Tuesday", depending on when the page is viewed.

- **Rank:** "the hottest", "the 2nd hottest", "the equal 3rd hottest".
- **Comparison:**
  - "day", "spring day", "October day", or "6 November".
  - The year so far: "day of the year so far".
  - The noun follows the measure: "night" for the minimum, "temperature range", "9am" and so on.
- **Scope:**
  - A rank-led fact says "on record", or "since 2009" when the series doesn't go back to when records began.
  - A since-led fact drops the rank and says "since 8 February", "since 20 December 2025", "since August 2024" or "since 2018", depending on how far back it reaches.
- **Gaps:** a rank-led fact with under 95% coverage names its longest gap, e.g. "(no records from March 2018 to July 2020)".
- **Beaten:** ", until Friday" within 6 days, otherwise ", until 3 November".
- **Provisional:** these facts start with "provisionally".

Each fact also has a `why` for the site:

- the value, rank, ties and days compared
- the record start, missing days and gaps
- the previous record holder (the best earlier comparable day)
- the since and `beatenBy` days
- the 10 best comparable days up to the fact's date

## Trying it out

- `npm run smoke:facts [location-id] [date] [max-rank]` prints one day's candidate facts.
- `npm run smoke:sections [location-id] [date]` prints the three sections for the 31 days to a date.
- The snapshot tests in `test/selection.test.ts` record the sections for five real windows, so any change to the scoring shows up as a diff to review.
