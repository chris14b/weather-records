# How facts are made

This explains how the pipeline turns a location's daily data into the few facts on its home page, and why. The code is the source of truth for the numbers. The constants named here are where to change them.

There are four steps:

1. Build one **series** per measure.
2. **Rank** every recent day against the comparable days before it (`daily-facts.ts`), every recent period against the comparable periods before it (`period-facts.ts`), and the forecast's days against both (`forecast-facts.ts`). `generateCandidates` in `candidates.ts` does all three.
3. **Score** each ranking by how unusual it is (`scoring.ts`).
4. **Select** the best for each section, and **word** them (`selection.ts`, `wording.ts`).

Facts about daylight are made apart from these, from where the location is (see Daylight, below).

## 1. Series

A series is one measure's single-day values for a location, in date order (`series.ts`). There are 13:

| Measure                                        | From                                            | Starts                      |
| ---------------------------------------------- | ----------------------------------------------- | --------------------------- |
| `maxTemp`, `minTemp`, `rain`                   | ZIPs, then FTP daily files, then live snapshots | when records began          |
| `range` (max minus min)                        | the two series above, on days with both         | when records began          |
| `maxRelHum`, `minRelHum`, `solar`              | FTP history (`data/ftp-history/`)               | 2009 (2011 at Olympic Park) |
| `temp9am`, `relHum9am`, `temp3pm`, `relHum3pm` | saved readings (`data/recent/readings/`)        | when saving began           |
| `maxTempChange`, `minTempChange`               | each day's value minus the day before's         | when records began          |

- A series whose history goes back to when records began has `fullRecord` set. Only those may say "since records began in 1859"; the others say "since 2009" and so on.
- Missing days are simply absent. Nothing is filled in, and nothing is counted through a gap.
- A multi-day rain or temperature total is left out of the days, so the days it covers count as missing. It is kept apart, as the series' `multiDay`, for rain totals over periods (see Periods). A ZIP value with a blank period counts as a single day only on a series' first day or after a day with a value. Otherwise it probably is an accumulation, and is left out too.
- A **change** is left out when either its day or the day before has no value, so a change is never taken across a gap. Only the maximum and minimum have changes. Changes in rain, range and humidity were judged not worth showing.
- A value from a live snapshot is `provisional`. Everything else is `confirmed`. A range is provisional if either its max or its min is, and a change if either day's value is.

## 2. Ranking

### Days

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

### Periods

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

#### Missing days

A period with too many missing days has no value. It isn't compared, and counts towards the fact's `missingDays` and `gaps`, as a missing day does. Nothing is filled in.

- **Rain** must have every day: a missing day might have been the wettest. A multi-day total counts when it falls wholly inside the period. One that crosses the period's start or end leaves the period incomplete.
- **Temperatures** are averaged over the days that have values. In each calendar month the period covers, at most a sixth of the days may be missing (5 of 30 or 31, 4 of 28), and no more than 3 in a row. This follows the WMO's rule for monthly means. The multi-day temperature values are left out, as for days.
- Means are rounded to 0.1°C, as BOM does, and totals to 0.1 mm.

#### Runs of days

Runs of days overlap, so they need three rules of their own:

- **Spells:** a run gets facts only if it starts and ends wet, and no day in it holds two thirds of its rain (`largestDayShare`). Otherwise it would repeat a shorter run, or one wet day.
- **Overlaps:** a run that an overlapping earlier run matched or beat gets no facts. During a long wet spell, only the runs that set a new peak count.
- **Rank:** earlier runs that beat it are counted once per spell, that is, once per stretch of consecutive end days. A week of heavy rain counts once, not once for each run that holds it. `compared` and `comparedSince` count runs, one per day, so a run scores on the same scale as a day.

#### The 2020 Observatory Hill station change

066214 reads about 0.3°C warmer than 066062 for maximums and 0.3°C cooler for minimums (`reads` in `locations.ts`). A mean over a month is much more sensitive to that than a day's extreme. So a mean temperature is compared twice: as measured, and with each period's average station offset taken out. A period beats another only if it does so both ways, and it is matched if either way matches it. This only ever makes a fact weaker: to 29 October 2026, Observatory Hill's start to the year is the 3rd hottest rather than the hottest, because 2013's and 2019's were within the offset. Pass `offsets: stationOffsets(location)`.

### Forecasts

`generateForecastFacts` ranks the 7-day forecast as if it comes true, and works out what it would take to do better. Pass the forecast to `generateCandidates` as `forecast: { days, from: forecastStart(now) }`.

#### Maximums and minimums

Each forecast maximum and minimum is ranked like an observed day, with the same comparisons and fields, and the status `forecast`.

- **Which days:** from `forecastStart`: today until 9pm Sydney time, when the live maximum's window closes, and tomorrow after that. So the morning run says "if today reaches…" and the evening run starts from tomorrow. A day the series already has a value for is left out, and so are the forecast's blanks: today's minimum, and in the afternoon issue today's maximum.
- **Comparable days:** the observed ones, and the forecast's earlier days as if they come true. So if Wednesday is forecast 38°C and Thursday 37°C, Thursday is only "the hottest since Wednesday", and Wednesday's fact ends ", until Thursday" if Thursday is forecast hotter.

#### Rain over the next 7 days

The rain amounts with a 50% chance are totalled over the forecast's first 7 days, and ranked as a run of 7 days, against all runs, the same season and the same month.

- **Crediting:** observed rain is the 24 hours to 9am, but a forecast day is midnight to midnight. Most of a forecast day's rain falls before 9am the next day, so each day's amount counts towards the next day. The run then starts the day after the last observed rain, with no overlap.
- **No range:** BOM gives no rain range on days with a low chance of rain. Below a 25% chance, the amount with a 25% chance must be 0 mm, so both amounts count as 0 mm. A day with no range and a higher chance, or no chance either, leaves the total unknown, and there is no fact.
- **No spell rules:** the forecast's run has no spell rules (see Runs of days), since which of its days are wet is too uncertain. A dry forecast gets no fact.

#### What it would take

For every forecast fact, a **conditional** fact gives the most notable rank and since within reach, at the least value that gets them: "a top of 36.6°C would make it the hottest November day since records began in 1859".

- **Within reach:** 2°C beyond the forecast temperature, either way, and for rain up to the total of the amounts with a 25% chance.
- **Least value:** `boundariesBetween` in `thresholds.ts` gives the earlier values that the forecast doesn't beat but the limit does. A value 0.1 beyond the furthest of them gets the same rank and since as the limit itself. T12's near misses can use the same function to find the nearest one.
- If nothing within reach beats what the forecast already gets, there is no conditional fact.

## 3. Scoring

### The idea

Every score is the log of "how many comparable days pass for each fact like this one":

- **A rank:** a day is at least as extreme as the top `r` of `n` days about `r / n` of the time. So a rank scores `log(n / r)`. Here `r` is `rank + ties`, so being one of 300 days at 100% humidity is worth nothing.
- **A since:** a day is the most extreme of the last `m` comparable days about `1 / m` of the time. So a since scores `log(m)`, where `m` is `comparedSince`.

The two are on the same scale. A fact takes the larger, and its wording **leads** with that one. For scale, a once-a-year fact among all days scores about log(365), or 5.9. A once-a-week fact scores about log(7), or 1.9.

### Adjustments

Periods score the same way, counting comparable periods instead of days. A run of days ends on every day, so it is already on the days' scale. Calendar periods aren't: a record October scores log(160), not log(160 × 31). They are shown apart from the days (see Selection), so they only compete with each other.

These keep ranks easy to set from scoring too high:

- **Rank limit:** a rank scores 0 if `rank + ties` is above 10 (`lowestRank`), because "the 23rd hottest" isn't worth saying. A calendar date scores only at rank 1.
- **Short records:** a rank is multiplied by the cube root of (years of record / 30), capped at 1 (`fullStrengthYears`). This doesn't apply to the year so far. Olympic Park's 15 years give 0.79.
- **Missing days:** a rank is multiplied by the share of comparable days that have a value. The missing days might have held something better.
- **Sinces that don't count:** there is no since score for `year`, because its since is always the same day as the `all` since. There is none for `calendarDate`, and none when a gap falls after the since day, since the gap might have held a day that matched it. A day's or run's since for `month` or `season` counts only if it reaches back before the same month or season last year (`previousOccurrence`): "the coldest November night since 13 November 2025" covers only about 20 November days, but sounds like a year.
- **Comparison weight:** all 1, season 0.85, month 0.8, year 0.75, calendar date 0.6 (`comparisonWeights`). Narrow comparisons give many more chances to set a record, and are less interesting to read.
- **Measure weight:** 1 for temperature and rain, down to 0.75 for 9am and 3pm humidity (`measureWeights`). Changes weigh less than their measures: 0.9 for the maximum and 0.85 for the minimum.

### Worked examples

- **2013-01-18 at Observatory Hill**, 45.8°C: the highest of 55,916 days, with 349 missing. That gives log(55,916) × 1 for the record length × 0.994 for coverage, which is **10.86**. It leads with the rank: "the hottest day since records began in 1859".
- **2026-10-13 at Observatory Hill**, a 1.3°C range: only 148th smallest of all days, so the rank scores 0. But no day since 8 February matched it, about 247 comparable days. That gives log(247) × 0.9 for the range weight, which is **4.95**. It leads with the since: "the smallest temperature range since 8 February".
- **2026-10-13 at Observatory Hill**, a 14.9°C drop in maximum (34.8°C to 19.9°C): only the equal 21st biggest October drop, so the rank scores 0. But no October day since 2017 matched it, about 259 comparable days. That gives log(259) × 0.8 for the month × 0.9 for the change in maximum, which is **4.00**. It leads with the since: "the biggest day-to-day drop in maximum temperature in October since 2017".

## 4. Selection

`selectFacts` scores every candidate. For each date, it keeps only the strongest fact per **family**, direction and kind of period, because related measures say much the same thing. That also leaves one comparison per measure: "hottest this month" and "hottest this year" aren't both shown. The kinds are single days, runs of days, and calendar periods, so the 3 and 7 days to a day compete, and so do a month, a season and a year so far that end on the same day. The families are:

- max and 3pm temperature
- min and 9am temperature
- rain
- range
- humidity (all four)
- solar
- changes in maximum and minimum

A change isn't in its measure's family. A cold change often makes a day both "the coldest day since…" and "the biggest drop in maximum since…", but the two say different things: how cold it was, and how suddenly it got there.

A run of days is a **spell**, and stands for what overlaps it. A day fact in the same family and direction inside a spell that scores at least as well is dropped, and so is a weaker overlapping run. So the February 2020 rain at Olympic Park shows as "the wettest 3 days since records began in 2011" beside the wettest day, instead of four wet days in a row. The spell must score enough for its section, or it drops nothing.

It then fills the sections, counting back from the latest day that has any fact (`sectionRules`). A day goes in the section its date falls in, and a run of days in the section its first day falls in, so the 3 days to today are in This week:

| Section    | Days before the latest | Per day | In all | First fact needs | Further facts need |
| ---------- | ---------------------- | ------- | ------ | ---------------- | ------------------ |
| Today      | 0                      | 3       | 3      | 1.75             | 2.5                |
| This week  | 1–6                    | 2       | 12     | 1.75             | 3.5                |
| This month | 7–30                   | 1       | 5      | 5                | —                  |

A score of 1.75 is a since of about 6 days, so "the warmest day since last Tuesday" can show in the last week. Older days need about a once-a-year fact.

The latest complete month, season and year, and the current ones so far, go in This month as well, with an allowance of their own so they never crowd out its days (`calendarRule`): up to 3, each scoring at least 3, about a once-in-20-years period.

An **all-time record** meets any section's minimum score, however little it scores (`isAllTimeRecord`), though it still counts towards the section's limits. It is an outright record, with no ties, among all days or runs, or for a calendar period among its own comparison: "the wettest spring since records began", "the hottest November so far". In practice this only matters for calendar periods over a short record. Olympic Park's 15 springs or years make even a record score log(15) × 0.79, about 2.2, so on 9 November 2026 its "warmest nights since records began in 2011" would otherwise be left out. A day's record among all days scores well above any minimum anyway, and records for a calendar date or the year so far, which some measure sets nearly every day, keep to their scores.

Forecast and conditional facts go in a fourth section, the **coming week**. Neither is used to find the latest day, so they never move Today. Forecast, conditional and observed facts are kept apart when choosing the strongest per family, and a spell only stands for facts of its own kind.

- **Forecast facts:** up to 2 a day and 7 in all, the first scoring at least 3.5 (a since of about a month) and the second at least 4.5.
- **Conditional facts** have an allowance of their own (`conditionalRule`), since nearly every forecast has a notable value within reach, and nearby days have much the same one: up to 2, each scoring at least 4, and only the strongest per family and direction across the week. Each must also score at least log(2) more than the forecast fact for its day, family and direction (`conditionalGain`), so it is at least twice as rare as what the forecast already gets.
- **Fallback:** the site moves facts about the latest day into Today, so if nothing is left for the days after it, the strongest forecast or conditional fact about them is shown if it scores at least 2 (`forecastFloor`), about a since of a week. An ordinary week still says something, such as "the coldest day since 3 November".

Daylight facts have an allowance of their own (see Daylight), so they never take the place of a weather fact.

A fact that a later day beat (its `beatenBy`) is never shown, since it would only send the reader to that day's. A weaker fact about the same day that nothing beat can still show.

Today, This week and This month run strongest first. The coming week runs soonest first, with a day's forecast facts before its conditional ones, and its daylight last.

## 5. Wording

`describeFact` writes what the day was, without naming the day, its value or its status: e.g. "the 2nd hottest October day since records began in 1859". The site makes a sentence of it for when the page is viewed (see The sentence, below).

- **Rank:** "the hottest", "the 2nd hottest", "the equal 3rd hottest".
- **Comparison:**
  - "day", "spring day", "October day", or "6 November".
  - The year so far: "day of the year so far".
  - The noun follows the measure: "temperature range", "9am" and so on.
  - The minimum and rain have no noun, because the site names their day "last night" or "the 24 hours to 9am Friday", and "Last night was the coldest night" says night twice: "the coldest", "the wettest in October", "the coldest of the year so far", "the wettest for the date".
  - A change is "the biggest day-to-day rise in maximum temperature" or "drop in minimum temperature". Its comparison follows it: "in spring", "in October", "on 13 October".
- **Scope:**
  - A rank-led fact says "since records began in 1859", or "since 2009" when the series doesn't go back to when records began.
  - A since-led fact drops the rank and says "since 8 February", "since 20 December 2025", "since August 2024" or "since 2018", depending on how far back it reaches. For a `month` comparison it is always the year: "in November since 2024", never "since November 2024".
- **Gaps:** a rank-led fact with under 95% coverage names its longest gap, e.g. "(no records from March 2018 to July 2020)". A period says how many earlier ones it left out: "(not counting 16 years with gaps)". At Observatory Hill these are years between 1864 and 1948 with a month or so missing.
- **Periods:**
  - The site names the period, so one compared with its own kind has no noun: "the wettest" for an October among Octobers, a spring or a month so far, and "the wettest in spring" for 7 days among spring's. "October was the wettest October" would say it twice.
  - Months among all months and years keep theirs: "the 3rd hottest month", "the hottest year", and for the year so far "so far the 3rd hottest year", since "start to the year" reads oddly by November.
  - A period's minimum is its nights: "the warmest nights" (the site says "October had…"), or "the month with the coldest nights" among all months.
  - A since is a day for a run of days ("since 8 February"). For months among all months it is a month ("since March", "since March 2025") or a year. Everything else is compared once a year, so its since is a year.

### The sentence

`sentence` in `src/site/naming.ts` makes the sentence for when the page is viewed, in Sydney time. It has three parts, so the page can set the day apart.

- **Subject:** "Today", "Yesterday", a weekday within 6 days, otherwise a date ("12 October"). A minimum is for the 24 hours to 9am, so it names the night that ends on its date by its evening: "Last night", "Tonight", "Thursday night", "The night of 2 November". A day's rain is "The 24 hours to 9am Friday". Periods are "October", "October 2025" in another year, "The 3 days to Tuesday", "November so far", "Spring", "2026" for the year so far, and "2025".
- **Verb:** "is" or "was" by whether the day is over. A night, the rain to 9am and the 9am readings are over by the time the page shows them. Rain days and runs of days take "were". Measures that aren't a kind of day take "had": changes, ranges, humidity and the 9am and 3pm readings ("Thursday had the lowest peak humidity"). A period's nights take "had", "has had" or, for the year so far, "has so far had". Forecasts are "is forecast to be".
- **Value**, with its unit from the measure: "with a top of 23.6°C", "with a low of 11.6°C", "with 49.6 mm", "up 6.7°C" for a change, "at 79%", "with an average top of 23.6°C" for a period. Observed values show one decimal, forecasts whole degrees as BOM gives them.
- **Provisional:** shown exactly like a confirmed fact, with no words and the same dot ("Observed" in the legend). The live feed is treated as fact.
- **Conditional:** built around what it needs: "A low of 10°C tonight (forecast 12°C) would make it the coldest November night since 2006", "A top of 36.6°C on Thursday (forecast 35°C) would make it…", "90.1 mm in the 7 days to Sunday (forecast 70 mm) would make them…".

### Standout marks

The site marks the rarest facts with a badge before the sentence, "Rare" or "Exceptional" (`standout` in `src/site/arrange.ts`), in every section and on the headline. A day or run of days is rare from a score of 6.5, about once in 2 years, and exceptional from 9, about once in 20. A calendar period's score counts periods, not days, so it is rare from 3.5 and exceptional from 4.5: in practice a top-3 period, and a record over a long record. On the snapshot windows these mark 12 of 58 facts, 5 of them exceptional. On 9 November 2026, an ordinary week, they marked only the year so far's records.

Each fact also has a `why` for the site:

- the value, rank, ties and days compared, and for a conditional fact the forecast value as `forecast` (its `value` is what the day would need)
- the record start, missing days and gaps
- the previous record holder (the best earlier comparable day)
- the since day
- the 10 best comparable days or periods up to the fact's date, counting overlapping runs of days once

## Daylight

`generateDaylightFacts` in `daylight-facts.ts` finds the turning points in the year's daylight: the earliest and latest sunrise, the earliest and latest sunset, and the longest and shortest day. They come from the year's own curve, not from ranks against past years, and every location has the same six each year, give or take a day.

- **Sunrise and sunset** come from `sunTimes` in `src/shared/sun.ts`, NOAA's solar calculator equations, worked out from the location's latitude and longitude. They match the US Naval Observatory's published times to the minute. Sunrise and sunset are when the sun's top edge is on the horizon, allowing for refraction (a zenith of 90.833°).
- **Turning points:** a day is one if its sunrise, sunset or day length is further out than the day before's, and at least as far as the day after's. They are found on the sun's own time, unrounded and without daylight saving, so the curve is smooth and each has exactly one day. At Observatory Hill in 2026 they are the latest sunset on 7 January, the earliest sunset on 12 June, the shortest day on 21 June, the latest sunrise on 30 June, the earliest sunrise on 6 December and the longest day on 22 December.
- **Of the year or the season:** on the clock, daylight saving moves sunrise and sunset an hour. The sunrises just before it starts in October are earlier than December's (5:30am on 3 October 2026, against 5:37am), and those just before it ends in April later than July's. So a turning point is "of the year" only if no other day of its calendar year beats it on the clock, and otherwise "of" its season, if nothing in the season does: "the earliest sunrise of summer", "the latest sunrise of winter". Day lengths don't change with the clock, so the solstices are always of the year.
- **Scoring:** six turning points a year make each about a once-in-61-days fact, so they score log(365.25 / 6), or 4.11 (`scoreDaylight` in `scoring.ts`). Sunrises and sunsets weigh 0.9, since the solstices are the turning points people know, and one of only its season weighs 0.85 more, as a season comparison does. So the scores are 4.11, 3.70 and 3.14. That beats an everyday fact, so a solstice can lead Today, but not a record.
- **Selection:** a turning point is news for about a week either side. It goes in Today on the latest day, in This week for the 6 days before, and in the coming week for the 7 days after the window's end (`daylightAround`), never in This month. Turning points are at least 9 days apart, so each section has room for every one in its days, on top of its weather facts.
- **Wording:** `describeDaylight` gives "the longest day of the year" or "the earliest sunrise of summer". The site's `daylightSentence` adds the day and its value: "Thursday has the earliest sunrise of summer, at 5:37am", "Friday had the latest sunset of the year, at 8:10pm". A solstice gives its daylight: "Today is the longest day of the year, with 14 hours 25 minutes of daylight".
- **On the page:** a daylight fact has its own mark, a half-filled dot ("Daylight" in the legend), since it is neither observed nor forecast. It never gets a standout badge, since it comes round every year. It has no `why`: `facts.json` gives its `event`, `scope`, and its day's `sunrise` and `sunset` to the minute.

Every fact in `facts.json` has a `kind`: `record` for the ranked facts above, and `daylight`.

## Trying it out

- `npm run smoke:facts [location-id] [date] [max-rank]` prints one day's candidate facts.
- `npm run smoke:sections [location-id] [date]` prints the three sections for the 31 days to a date, with day, period and daylight facts.
- `npm run smoke:forecast [location-id]` downloads the live forecast and prints the coming week. With a date as well, it prints the coming week that a morning run that day would have seen, if the forecast had matched what was observed: the data stops the day before, and the rain amounts with a 25% chance are 1.5 times the observed rain.
- The snapshot tests in `test/selection.test.ts` record the sections for five real windows, so any change to the scoring shows up as a diff to review.
