# How facts are made

This explains how the pipeline turns a location's daily data into the few facts on its home page, and why. The code is the source of truth for the numbers. The constants named here are where to change them.

There are four steps:

1. Build one **series** per measure.
2. **Rank** every recent day against the comparable days before it (`daily-facts.ts`), every recent period against the comparable periods before it (`period-facts.ts`), and every recent streak against the earlier streaks (`streak-facts.ts`). `generateCandidates` in `candidates.ts` does all three.
3. **Score** each ranking by how unusual it is (`scoring.ts`).
4. **Select** the best for each section, and **word** them (`selection.ts`, `wording.ts`).

## 1. Series

A series is one measure's single-day values for a location, in date order (`series.ts`). There are 13:

| Measure                                        | From                                            | Starts                      |
| ---------------------------------------------- | ----------------------------------------------- | --------------------------- |
| `maxTemp`, `minTemp`, `rain`                   | ZIPs, then FTP daily files, then live snapshots | when records began          |
| `range` (max minus min)                        | the two series above, on days with both         | when records began          |
| `maxRelHum`, `minRelHum`, `solar`              | FTP history (`data/ftp-history/`)               | 2009 (2011 at Olympic Park) |
| `temp9am`, `relHum9am`, `temp3pm`, `relHum3pm` | saved readings (`data/recent/readings/`)        | when saving began           |
| `maxTempChange`, `minTempChange`               | each day's value minus the day before's         | when records began          |

- A series whose history goes back to when records began has `fullRecord` set. Only those may say "on record"; the others say "since 2009" and so on.
- Missing days are simply absent. Nothing is filled in, and nothing is counted through a gap.
- A multi-day rain or temperature total is left out of the days, so the days it covers count as missing. It is kept apart, as the series' `multiDay`, for rain totals over periods (see 2b). A ZIP value with a blank period counts as a single day only on a series' first day or after a day with a value. Otherwise it probably is an accumulation, and is left out too.
- A **change** is left out when either its day or the day before has no value, so a change is never taken across a gap. Only the maximum and minimum have changes. Changes in rain, range and humidity were judged not worth showing.
- A value from a live snapshot is `provisional`. Everything else is `confirmed`. A range is provisional if either its max or its min is, and a change if either day's value is.

## 2. Ranking

`generateDailyFacts` looks at every day in the window: the 31 days to today, by default. For each day that has a value, it makes a candidate fact for every combination of:

- **Measure:** each series.
- **Direction:** `highest` and `lowest`. Rain has only `highest`, and a dry day gets no facts at all, or every dry day would be "the equal wettest" of something. For a change, `highest` is the biggest rise and `lowest` the biggest drop. A rise gets only `highest` facts, a drop only `lowest`, and no change none, so a rise is never "the biggest drop".
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

## 2b. Periods

`generatePeriodFacts` ranks periods longer than a day the same way, with the same fields. A period is named by its last day, its `date`, and also has a `from`. Every period compared with it has the same kind, so the dates in its why are last days too.

| Period                                      | Measures                               | Facts for                                          | Comparisons                          |
| ------------------------------------------- | -------------------------------------- | -------------------------------------------------- | ------------------------------------ |
| `rolling`: the 3 or 7 days to a day         | total rain                             | every day in the window                            | all, season, month (of its last day) |
| `month`, complete                           | total rain, mean maximum, mean minimum | the latest complete one, if it ended in the window | all months, the same month           |
| `season`, complete                          | the same                               | the same                                           | the same season                      |
| `year`, complete                            | the same                               | the same                                           | all years                            |
| `month`, `season`, `year` so far (`toDate`) | the same                               | the current one, to the measure's latest day       | the same days of every earlier year  |

- **Complete** means the period's last day is no later than the measure's latest day. Until then, it is a period so far. A period so far needs at least 7 days, and a season or year so far must be past its first month, or it would only repeat a shorter one. On its last day, a period is complete instead.
- **So far** compares, for example, 1–10 November with 1–10 November of every earlier year. 29 February is compared with the 28th in other years.
- **Directions:** both for calendar periods ("the wettest October", "the driest October"). Runs of days have only `highest`, since a dry week is not news.

### Missing days

A period with too many missing days has no value. It isn't compared, and counts towards the fact's `missingDays` and `gaps`, as a missing day does. Nothing is filled in.

- **Rain** must have every day: a missing day might have been the wettest. A multi-day total counts when it falls wholly inside the period. One that crosses the period's start or end leaves the period incomplete.
- **Temperatures** are averaged over the days that have values. In each calendar month the period covers, at most a sixth of the days may be missing (5 of 30 or 31, 4 of 28), and no more than 3 in a row. This follows the WMO's rule for monthly means. The multi-day temperature values are left out, as for days.
- Means are rounded to 0.1°C, as BOM does, and totals to 0.1 mm.

### Runs of days

Runs of days overlap, so they need three rules of their own:

- **Spells:** a run gets facts only if it starts and ends wet, and no day in it holds two thirds of its rain (`largestDayShare`). Otherwise it would repeat a shorter run, or one wet day.
- **Overlaps:** a run that an overlapping earlier run matched or beat gets no facts. During a long wet spell, only the runs that set a new peak count.
- **Rank:** earlier runs that beat it are counted once per spell, that is, once per stretch of consecutive end days. A week of heavy rain counts once, not once for each run that holds it. `compared` and `comparedSince` count runs, one per day, so a run scores on the same scale as a day.

### The 2020 Observatory Hill station change

066214 reads about 0.3°C warmer than 066062 for maximums and 0.3°C cooler for minimums (`reads` in `locations.ts`). A mean over a month is much more sensitive to that than a day's extreme. So a mean temperature is compared twice: as measured, and with each period's average station offset taken out. A period beats another only if it does so both ways, and it is matched if either way matches it. This only ever makes a fact weaker: to 29 October 2026, Observatory Hill's start to the year is the 3rd hottest rather than the hottest, because 2013's and 2019's were within the offset. Pass `offsets: stationOffsets(location)`.

## 2c. Streaks

`generateStreakFacts` ranks runs of days in a row that each meet a fixed threshold:

| Streak  | Each day           | Shortest | Direction | Wording                                                                   |
| ------- | ------------------ | -------- | --------- | ------------------------------------------------------------------------- |
| `dry`   | 0 mm of rain       | 5 days   | lowest    | "the 12th dry day in a row, the longest dry spell since 2019"             |
| `max30` | a maximum of 30°C+ | 3 days   | highest   | "the 4th day in a row of 30°C or more, the longest run of 30°C days…"     |
| `max35` | a maximum of 35°C+ | 2 days   | highest   | "the 2nd day in a row of 35°C or more, the longest run of 35°C days…"     |
| `min20` | a minimum of 20°C+ | 3 days   | highest   | "the 9th night in a row of 20°C or more, the longest run of 20°C nights…" |

- **Fixed thresholds**, not ones relative to the time of year, because the wording can name them and readers know what 30°C means. The time of year comes in through the comparisons: a streak is compared with all earlier streaks, and with those that ended in the same season and the same month. "Of the year so far" and the calendar date were left out, as for runs of days.
- **The shortest streak** worth a fact depends on how common the days are. Observatory Hill has about 29 runs of 3 or more dry days a year, 18 of 5 or more, about one run of 3 days of 30°C or more, and almost never 3 days of 35°C. Wet days were tried and dropped: a run of days with rain mostly repeated the rain totals over 3 and 7 days, and crowded them out.
- **One fact per day of a streak:** each day in the window that a streak reaches gets a fact for its length so far, judged against the streaks that ended before it began. So a streak keeps the rank it had at the time, and "the 12th dry day in a row" is true on the 12th day even if the 13th was dry too.
- **Ranks and sinces:** `rank` is 1 plus the number of earlier comparable streaks that were longer, `ties` the number exactly as long, and `since` the last day of the most recent one at least as long. A streak is keyed by its last day, so one from 20 October to 3 November is a November streak.
- **Days, not streaks, are counted:** `compared` and `comparedSince` count comparable days with a value, as for a day fact, and `missingDays` and `gaps` are the days that can't be judged. So a streak scores on the days' scale: the longest dry spell on record at Observatory Hill scores about as much as its hottest day.
- **Ended:** a streak's `period.ended` is true when the day after it has a value that breaks it. Its wording then changes to "the last of 12 dry days in a row".
- **Beaten:** `beatenBy` is the first later day in the window on which a separate comparable streak grew longer than this one. Its own later days don't count.
- **Status:** provisional if any of its days is.
- **Direction:** a dry streak's is `lowest`, so in selection it never competes with facts about wet days. Its leaders in the why still run longest first.

### Missing days

A missing day ends a streak. Nothing is counted through it.

- A streak that starts on the series' first day, or just after a missing day, gets no facts, since it may have started earlier. It is still compared with later streaks at its known length.
- A streak that ends just before a missing day hasn't ended: its wording stays "the 12th dry day in a row".
- A multi-day rain total of 0 mm shows that every day it covers was dry, so those days count as dry. Any other multi-day total leaves its days missing, since one of them had rain but which is unknown. None of the totals in the ZIPs are 0 mm today.
- The 2020 Observatory Hill station change is not handled. Streaks compare the joined series as day facts do. On days above 30°C the two stations agree closely, and the new station's lower minimums can only shorten a run of warm nights.

## 3. Scoring

### The idea

Every score is the log of "how many comparable days pass for each fact like this one":

- **A rank:** a day is at least as extreme as the top `r` of `n` days about `r / n` of the time. So a rank scores `log(n / r)`. Here `r` is `rank + ties`, so being one of 300 days at 100% humidity is worth nothing.
- **A since:** a day is the most extreme of the last `m` comparable days about `1 / m` of the time. So a since scores `log(m)`, where `m` is `comparedSince`.

The two are on the same scale. A fact takes the larger, and its wording **leads** with that one. For scale, a once-a-year fact among all days scores about log(365), or 5.9. A once-a-week fact scores about log(7), or 1.9.

### Adjustments

Periods score the same way, counting comparable periods instead of days. A run of days ends on every day, so it is already on the days' scale, and a streak counts days (see 2c). Calendar periods aren't: a record October scores log(160), not log(160 × 31). They are shown apart from the days (see 4), so they only compete with each other.

These keep ranks easy to set from scoring too high:

- **Rank limit:** a rank scores 0 if `rank + ties` is above 10 (`lowestRank`), because "the 23rd hottest" isn't worth saying. A calendar date scores only at rank 1.
- **Short records:** a rank is multiplied by the cube root of (years of record / 30), capped at 1 (`fullStrengthYears`). This doesn't apply to the year so far. Olympic Park's 15 years give 0.79.
- **Missing days:** a rank is multiplied by the share of comparable days that have a value. The missing days might have held something better.
- **Sinces that don't count:** there is no since score for `year`, because its since is always the same day as the `all` since. There is none for `calendarDate`, and none when a gap falls after the since day, since the gap might have held a day that matched it.
- **Comparison weight:** all 1, season 0.85, month 0.8, year 0.75, calendar date 0.6 (`comparisonWeights`). Narrow comparisons give many more chances to set a record, and are less interesting to read.
- **Measure weight:** 1 for temperature and rain, down to 0.75 for 9am and 3pm humidity (`measureWeights`). Changes weigh less than their measures: 0.9 for the maximum and 0.85 for the minimum.

### Worked examples

- **2013-01-18 at Observatory Hill**, 45.8°C: the highest of 55,916 days, with 349 missing. That gives log(55,916) × 1 for the record length × 0.994 for coverage, which is **10.86**. It leads with the rank: "the hottest day on record".
- **2026-10-13 at Observatory Hill**, a 1.3°C range: only 148th smallest of all days, so the rank scores 0. But no day since 8 February matched it, about 247 comparable days. That gives log(247) × 0.9 for the range weight, which is **4.95**. It leads with the since: "the smallest temperature range since 8 February".
- **2026-10-13 at Observatory Hill**, a 14.9°C drop in maximum (34.8°C to 19.9°C): only the equal 21st biggest October drop, so the rank scores 0. But no October day since 2017 matched it, about 259 comparable days. That gives log(259) × 0.8 for the month × 0.9 for the change in maximum, which is **4.00**. It leads with the since: "the biggest day-to-day drop in maximum temperature in October since 2017".

## 4. Selection

`selectFacts` scores every candidate. A streak has a fact for every day in the window it reached, so only its latest day is kept: a streak still running shows on today, and a long one doesn't reappear in This week for each day it ran. For each date, it keeps only the strongest fact per **family**, direction and kind of period, because related measures say much the same thing. That also leaves one comparison per measure: "hottest this month" and "hottest this year" aren't both shown. The kinds are single days, runs of days, calendar periods and streaks, so the 3 and 7 days to a day compete, and so do a month, a season and a year so far that end on the same day, and streaks of 30°C and 35°C days. The families are:

- max and 3pm temperature
- min and 9am temperature
- rain
- range
- humidity (all four)
- solar
- changes in maximum and minimum

A change isn't in its measure's family. A cold change often makes a day both "the coldest day since…" and "the biggest drop in maximum since…", but the two say different things: how cold it was, and how suddenly it got there.

A run of days is a **spell**, and stands for what overlaps it. A day fact in the same family and direction inside a spell that scores at least as well is dropped, and so is a weaker overlapping run. So the February 2020 rain at Olympic Park shows as "the wettest 3 days on record" beside "the wettest day on record", instead of four wet days in a row. The spell must score enough for its section, or it drops nothing. A streak is never dropped this way: "the 5th day in a row of 30°C or more" says something that "the hottest day since…" doesn't.

It then fills the sections, counting back from the latest day that has any fact (`sectionRules`). A day goes in the section its date falls in, and a run of days in the section its first day falls in, so the 3 days to today are in This week. A streak goes in the section of its last day, so a streak still running is in Today:

| Section    | Days before the latest | Per day | In all | First fact needs | Further facts need |
| ---------- | ---------------------- | ------- | ------ | ---------------- | ------------------ |
| Today      | 0                      | 3       | 3      | 1.75             | 2.5                |
| This week  | 1–6                    | 2       | 12     | 1.75             | 3.5                |
| This month | 7–30                   | 1       | 5      | 5                | —                  |

A score of 1.75 is a since of about 6 days, so "the warmest day since last Tuesday" can show in the last week. Older days need about a once-a-year fact.

The latest complete month, season and year, and the current ones so far, go in This month as well, with an allowance of their own so they never crowd out its days (`calendarRule`): up to 3, each scoring at least 3, about a once-in-20-years period.

Each list runs latest first, then by score.

## 5. Wording

`describeFact` writes what the day was, without naming the day: e.g. "the 2nd hottest October day on record". The site adds "Today" or "Last Tuesday", depending on when the page is viewed.

- **Rank:** "the hottest", "the 2nd hottest", "the equal 3rd hottest".
- **Comparison:**
  - "day", "spring day", "October day", or "6 November".
  - The year so far: "day of the year so far".
  - The noun follows the measure: "night" for the minimum, "temperature range", "9am" and so on.
  - A change is "the biggest day-to-day rise in maximum temperature" or "drop in minimum temperature". Its comparison follows it: "in spring", "in October", "on 13 October".
- **Scope:**
  - A rank-led fact says "on record", or "since 2009" when the series doesn't go back to when records began.
  - A since-led fact drops the rank and says "since 8 February", "since 20 December 2025", "since August 2024" or "since 2018", depending on how far back it reaches.
- **Gaps:** a rank-led fact with under 95% coverage names its longest gap, e.g. "(no records from March 2018 to July 2020)".
- **Beaten:** ", until Friday" within 6 days, otherwise ", until 3 November".
- **Provisional:** these facts start with "provisionally".
- **Periods:**
  - Rain and maximums: "the wettest October", "the 3rd hottest month", "the driest spring", "the hottest year", "the hottest start to October", "the wettest start to the year".
  - A period's minimum needs saying: "the October with the warmest nights", "the start to spring with the 2nd coldest nights".
  - Runs of days: "the wettest 3 days", "the wettest 7 days in spring", "the wettest 3 days in October".
  - A since is a day for a run of days ("since 8 February"). For months among all months it is a month ("since March", "since March 2025") or a year. Everything else is compared once a year, so its since is a year.
  - A period with under 95% coverage says how many earlier ones were too incomplete: "(with 10 years too incomplete to compare)".
  - The site names the period from `period`, `from` and `date`: "October", "The 3 days to Tuesday", "November so far".
- **Streaks:**
  - Still running, it counts up: "the 12th dry day in a row", "the 4th day in a row of 30°C or more".
  - Once ended: "the last of 12 dry days in a row".
  - Then its rank or since: "the longest dry spell on record", "the equal 2nd longest run of 30°C days in summer on record", "the longest run of 20°C nights in February since 2019". A since is a day, as for days.
  - Its `value` is the number of days, not a measurement. The site names it from `date` alone: "Today: the 12th dry day in a row".

Each fact also has a `why` for the site:

- the value, rank, ties and days compared
- the record start, missing days and gaps
- the previous record holder (the best earlier comparable day)
- the since and `beatenBy` days
- the 10 best comparable days, periods or streaks up to the fact's date, counting overlapping runs of days once

## Trying it out

- `npm run smoke:facts [location-id] [date] [max-rank]` prints one day's candidate facts.
- `npm run smoke:sections [location-id] [date]` prints the three sections for the 31 days to a date, with day, period and streak facts.
- The snapshot tests in `test/selection.test.ts` record the sections for five real windows, so any change to the scoring shows up as a diff to review.
