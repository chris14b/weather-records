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

| Measure                                        | From                                            | Starts                                               |
| ---------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------- |
| `maxTemp`, `minTemp`, `rain`                   | ZIPs, then FTP daily files, then live snapshots | when records began                                   |
| `range` (max minus min)                        | the two series above, on days with both         | when records began                                   |
| `maxRelHum`, `minRelHum`, `solar`              | FTP history (`data/ftp-history/`)               | 2009 (2011 at Olympic Park)                          |
| `temp9am`, `relHum9am`, `temp3pm`, `relHum3pm` | saved readings (`data/recent/readings/`)        | the 1st of the month a year ago (`readingsKeptFrom`) |
| `maxTempChange`, `minTempChange`               | each day's value minus the day before's         | when records began                                   |

- A series whose history goes back to when records began has `fullRecord` set. Only those may say "since records began in 1859"; the others say "since 2009" and so on.
- The 9am and 3pm readings are kept for only about 13 months, as long as the Daily Weather Observations keep them, so they are **past-year** series (`pastYearSeries`, `pastYear`). Each day is compared only with the 365 days to it, from the day after the same date a year earlier (`yearBefore`), or from the series' first day if that is later. The readings are kept from the 1st of the month a year ago, so every one is in some day's year, but the oldest days in the 31-day window can have a few weeks less than a year: on 13 November 2026, 14 October needed readings from 15 October 2025, and they began on 1 November. Within a year, a month, a season or a date has nothing to be compared with but itself, so they are compared only among all days and the year so far (`comparisonsFor`).
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
  - `calendarDate`: the same date in every year. A minimum is credited to the date its night ends on, but the site names the night by its evening, so for this comparison a night is keyed by its evening (`dayKey`). The night of 28 February is then compared only with other nights of 28 February, whether they ended on 29 February or 1 March.
  - `dayOfWeek`: the same day of the week, Monday to Sunday alike, for the maximum, the minimum and rain only (`comparisonsFor`), since those are what people plan their days around. A night is keyed by its evening, as for the calendar date, and so is a day's rain, by the day its 24 hours start: most of it falls before midnight, and the forecast's day credited to that 9am is that day too (see Rain on each day). So the rain to 9am Sunday is Saturday's.

That's a few thousand candidates per location. Each is judged only against the comparable days **up to and including** its own date, so a day keeps the rank it had at the time. Each candidate records:

- `rank`: 1 plus the number of earlier comparable days that beat it. Tied values share a rank.
- `ties`: earlier comparable days with exactly the same value. A non-zero value means "equal".
- `compared`: the comparable days with a value, including this one.
- `since`: the most recent earlier comparable day that matched or beat it. It is null for an outright record.
- `comparedSince`: the comparable days with a value after `since`, including this one.
- `beatenBy`: the first later comparable day in the window that strictly beat it. A later day that only equals it doesn't count. For the day of the week, any later day counts, or in a cold week every day could be "the coldest of its day of the week".
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

### Values still running

The live feed has three values that build up through their window: the maximum to 9pm, the minimum to 9am and the rain since 9am, which is part of the 24 hours to 9am tomorrow. While its window is open, a value is a floor or a ceiling: the day's maximum and rain can only rise, and the night's minimum only fall. `parseRunningValues` reads them, `withoutRunning` takes them out of the saved observations (the maximum is saved from 4pm), and `generateRunningFacts` ranks each as its day's value, with the status `partial` and the time it was read as `observedAt`.

- **One way only:** a running maximum or rain total gives only "highest" facts, and a running minimum only "lowest" ones. "The hottest day since February" stays true however the day goes on; "the coolest" might not. Its rank can only get stronger.
- **Single days only:** the series leave a running value out, so it gives no range, day-to-day change, runs of days or calendar periods. Those treat the day as not in yet, and so do the forecast's facts, so later forecast days are compared with today's forecast rather than with part of a day.
- **The same day's forecast** (`withoutOvertaken`): a forecast fact about the day is dropped once the running value has reached the forecast, since the running fact then says more. A "what it would take" fact is kept only while the day hasn't got there yet, and in the other direction while the day can still get there: with 31 °C so far, a top of 32 °C would still make a record, but a top of 28 °C can no longer happen.

### Forecasts

`generateForecastFacts` ranks the 7-day forecast as if it comes true, and works out what it would take to do better. Pass the forecast to `generateCandidates` as `forecast: { days, from: forecastStart(now) }`.

#### Maximums and minimums

Each forecast maximum and minimum is ranked like an observed day, with the same comparisons and fields, and the status `forecast`.

- **Which days:** from `forecastStart`: today until 9pm Sydney time, when the live maximum's window closes (`maxWindowClosesHour`), and tomorrow after that. So the runs to 8:30pm say "if today reaches…" and the 10:30pm run starts from tomorrow. Until then today's running maximum only settles how hot the day is, so on a cold day the forecast still says how cold it might be, and on a hot day `withoutOvertaken` drops the forecast once the running maximum reaches it. A day the series already has a value for is left out, and so are the forecast's blanks: today's minimum, and in the afternoon issue today's maximum.
- **Comparable days:** the observed ones, and the forecast's earlier days as if they come true. So if Wednesday is forecast 38°C and Thursday 37°C, Thursday is only "the hottest since Wednesday", and Wednesday's fact ends ", until Thursday" if Thursday is forecast hotter.

#### Rain on each day

Each day's rain with a 50% chance is ranked like an observed day's rain, against the observed days and the forecast's earlier days, with the same crediting and the same treatment of a missing range as the 7 days below. It starts from the day after the last observed rain, whatever day the temperatures start from, so the 10:30pm run can still give the rain to 9am tomorrow if BOM gives today's.

Its conditional fact is a **chance** (`rainChances`): BOM's range ends at the amount with a 25% chance, so the day is ranked at exactly that amount, against the observed days and the forecast's earlier days at their 50% amounts. There is one whenever that amount does better than the 50% amount, even if the 50% amount is 0 mm and the day has no forecast fact of its own, as on most showery days: "The 24 hours to 9 am Monday have a 25% chance of being the wettest since 4 November, with 20 mm or more". On 9 November 2026, a showery week, the best of these scored about 3.1, below the 4 a conditional fact needs, so none was shown.

#### Rain over the next 7 days

The rain amounts with a 50% chance are totalled over the forecast's first 7 days, and ranked as a run of 7 days, against all runs, the same season and the same month.

- **Crediting:** observed rain is the 24 hours to 9am, but a forecast day is midnight to midnight. Most of a forecast day's rain falls before 9am the next day, so each day's amount counts towards the next day. The run then starts the day after the last observed rain, with no overlap.
- **No range:** BOM gives no rain range on days with a low chance of rain. Below a 50% chance, the amount with a 50% chance must be 0 mm, and below 25% so must the amount with a 25% chance. So a day with a chance from 25% to 49% counts as 0 mm towards the total, but leaves what it would take unknown, and there is no conditional fact. A day with no range and a chance of 50% or more, or no chance either, leaves the total unknown, and there is no fact.
- **No spell rules:** the forecast's run has no spell rules (see Runs of days), since which of its days are wet is too uncertain. A dry forecast gets no fact.

#### What it would take

For every forecast fact, a **conditional** fact gives the most notable rank and since within reach, at the least value that gets them: "a top of 36.6 °C would make it the hottest November day since records began in 1859".

- **Within reach:** 2°C beyond the forecast temperature, either way, and for the 7 days' rain up to the total of the amounts with a 25% chance. That total is much less likely than 1 in 4, so the fact never says 25%. A single day's rain is a chance instead (see Rain on each day).
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

- **Rank limit:** a rank scores 0 if `rank + ties` is above 10 (`lowestRank`), because "the 23rd hottest" isn't worth saying.
- **Short records:** a rank is multiplied by the cube root of (years of record / 30), capped at 1 (`fullStrengthYears`). This doesn't apply to the year so far. Olympic Park's 15 years give 0.79.
- **Missing days:** a rank is multiplied by the share of comparable days that have a value. The missing days might have held something better.
- **Sinces that don't count:** there is no since score for `year`, because its since is always the same day as the `all` since. There is none when a gap falls after the since day, since the gap might have held a day that matched it. A day's or run's since for `month` or `season` counts only if it reaches back before the same month or season last year (`previousOccurrence`): "the coldest November night since 13 November 2025" covers only about 20 November days, but sounds like a year. A since for the day of the week counts only if it reaches back more than 52 weeks, since "the wettest Saturday since 31 October" is only a week.
- **Comparison weight:** all 1, season 0.85, month 0.8, calendar date 0.8, year 0.75, day of the week 0.7 (`comparisonWeights`). Narrow comparisons give many more chances to set a record, and are less interesting to read. The calendar date weighs as much as the month because "the coldest 9 November since 1999" reads better than a short since such as "the biggest day-to-day rise in minimum temperature since 1 November": on 9 November 2026 at Observatory Hill the first scores log(27) × 0.8, about 2.6, and the second 1.77. So a quiet day usually still has a fact for its date, and on a short record its record for the date can lead Today: Olympic Park's coldest 9 November since records began in 2011 scores 1.77. The day of the week weighs least: each day of the week holds about a seventh of the days, so it sets records about as often as a month does, and its interest is in the reading, "the wettest Saturday since 2022", not its rarity. On the 5th and 19th of every month in 2024 and 2025, facts for the day of the week were 9 of the 229 facts in Today and 24 of the 825 in Past week across the three locations, and none in Past month. Most were winter nights and cold days, such as Olympic Park's "the coldest Monday since 2018".
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

It then fills the sections of a page for one date (`sectionRules`). Each run makes a page for its own date and one for the next, and the site shows the page for the viewer's date (`pageFor` in `src/site/arrange.ts`), or the latest if the updates have stopped. So the page turns over at midnight, and the 10:30pm run's page for tomorrow is the one seen until the 6:30am run.

Today has the newest observations: the day facts of `latest`, the last date with any confirmed or provisional fact. A running value's facts don't count towards `latest`, so a running maximum doesn't push yesterday's maximum out of Today before the night is in. They are in Today while their 9am is on or after the page's date (`partialSection`): a running night stays there after midnight, and is dropped once its 9am has passed, by when a later run has settled it. On the page for the date after it, which is the 10:30pm run's page seen after midnight and the 6:30am and 8:30am runs' pages, Today keeps only the values still running at 9am on the page's date (`observationDay`). Those are the maximum and the day's other values, since the official maximum runs to 9am the next day. The night and the rain to 9am are over by 9am on their date, so they move to Past week. All of the day's facts move there once the 10:30am run brings the next date's. Every other day goes in the section its date falls in, counting back from the page's date, and a run of days in the section its first day falls in, so the 3 days to today are in Past week:

| Section    | Days before the page's date | Per day | In all | First fact needs | Further facts need |
| ---------- | --------------------------- | ------- | ------ | ---------------- | ------------------ |
| Today      | the newest observations     | 3       | 3      | 1.75             | 2.5                |
| Past week  | 1–6                         | 2       | 12     | 1.75             | 3.5                |
| Past month | 7–30                        | 1       | 5      | 5                | —                  |

A score of 1.75 is a since of about 6 days, so "the warmest day since last Tuesday" can show in the last week. Older days need about a once-a-year fact.

The latest complete month, season and year, and the current ones so far, go in Past month as well, with an allowance of their own so they never crowd out its days (`calendarRule`): up to 3, each scoring at least 3, about a once-in-20-years period.

An **all-time record** meets any section's minimum score, however little it scores (`isAllTimeRecord`), though it still counts towards the section's limits. It is an outright record, with no ties, among all days or runs, or for a calendar period among its own comparison: "the wettest spring since records began", "the hottest November so far". In practice this only matters for calendar periods over a short record. Olympic Park's 15 springs or years make even a record score log(15) × 0.79, about 2.2, so on 9 November 2026 its "warmest nights since records began in 2011" would otherwise be left out. A day's record among all days scores well above any minimum anyway, and records for a calendar date or the year so far, which some measure sets nearly every day, keep to their scores. A record in a past-year series isn't an all-time record either, and keeps to its score: each measure and direction sets one about once a year, and early in January it outscores the year so far, so it would otherwise always get in.

Forecast and conditional facts go in Today and a fourth section, the **coming week**, chosen together by the coming week's rules (`forecastSection`). Today has the forecasts that end by 9am tomorrow: today's maximum, tonight's low and the rain to 9am tomorrow, and the "what it would take" for each. After midnight, that includes the 10:30pm run's forecast for the night under way, until the 10:30am run brings it as observed. The 6:30am and 8:30am runs' forecast has no minimum for the night under way, so they have no fact about it. The rest go in the coming week, as does the 7-day rain, and a forecast about a day before the page's date is left out. Forecast, conditional and observed facts are kept apart when choosing the strongest per family, and a spell only stands for facts of its own kind.

- **Forecast facts:** up to 2 a day and 7 in all, the first scoring at least 3.5 (a since of about a month) and the second at least 4.5.
- **Conditional facts** have an allowance of their own (`conditionalRule`), since nearly every forecast has a notable value within reach, and nearby days have much the same one: up to 2, each scoring at least 4, and only the strongest per family and direction across the week. Each must also score at least log(2) more than the strongest forecast fact of its family and direction on any day the page shows (`conditionalGain`), so it is at least twice as rare as what the forecast already gets. A low of 21 °C on Friday night that would be the warmest since 7 March says little beside Saturday night's forecast of the warmest since 19 March, and it couldn't come true without undoing that.
- **Fallback:** if nothing is left for the coming week once Today has its forecasts, the strongest forecast or conditional fact about them is shown if it scores at least 2 (`forecastFloor`), about a since of a week. An ordinary week still says something, such as "the coldest day since 3 November".

Daylight facts have an allowance of their own (see Daylight), so they never take the place of a weather fact.

A fact that a later day beat (its `beatenBy`) is never shown, since it would only send the reader to that day's. A weaker fact about the same day that nothing beat can still show.

Past week and Past month run strongest first, and so do Today's observed and daylight facts, followed by its forecasts. Forecasts run soonest first, with a day's forecast facts before its conditional ones, and the coming week's daylight last.

## 5. Wording

`describeFact` writes what the day was, without naming the day, its value or its status: e.g. "the second hottest October day since records began in 1859". The site makes a sentence of it for when the page is viewed (see The sentence, below).

- **Rank:** "the hottest", "the second hottest", "the equal third hottest".
- **Comparison:**
  - "day", "spring day", "October day", or "6 November".
  - The year so far: "day of the year so far".
  - The noun follows the measure: "temperature range", "9 am" and so on. Humidity always says so ("the lowest 9 am humidity", "the highest peak humidity"), never "driest", which on the site means rain.
  - The minimum and rain have no noun, because the site names their day "last night" or "the 24 hours to 9 am Friday", and "Last night was the coldest night" says night twice: "the coldest", "the wettest in October", "the coldest of the year so far", "the wettest for 9 November". A night for the date is named by its evening, as the site names the night itself: "Last night was the coldest for the night of 8 November since 1999", and with its noun, in a conditional fact, "A low of 10 °C tonight would make it the coldest night of 9 November". Its since is the year of its evening, so a night of 31 December 1999 is "since 1999". A day's rain keeps its date, since its subject names the 9 am it ends at: "the wettest for 4 November".
  - A change is "the biggest day-to-day rise in maximum temperature" or "drop in minimum temperature". Its comparison follows it: "in spring", "in October", "on 13 October".
  - The day of the week names the day it is keyed by: "the hottest Saturday", "the coldest Friday night", and for a day's rain, whose subject names the 9am it ends at, "the wettest from a Saturday" ("The 24 hours to 9 am Sunday were the wettest from a Saturday since 2022"). Its since is worded as among all days, from the day it is keyed by: "since October 2025", "since 2022".
- **Scope:**
  - A rank-led fact says "since records began in 1859", or "since 2009" when the series doesn't go back to when records began. In a past-year series it says "in the past year" ("the warmest 9 am in the past year"), or, for a day with less than a year of readings before it, since the series began ("since November 2025").
  - A since-led fact drops the rank and says "since 8 February", "since 20 December 2025", "since August 2024" or "since 2018", depending on how far back it reaches. For a `month` or `calendarDate` comparison it is always the year: "in November since 2024", never "since November 2024", and "the coldest 9 November since 1999".
- **Gaps:** a rank-led fact with under 95% coverage names its longest gap, e.g. "(no records from March 2018 to July 2020)". A period says how many earlier ones it left out: "(not counting 16 years with gaps)". At Observatory Hill these are years between 1864 and 1948 with a month or so missing.
- **Periods:**
  - The site names the period, so one compared with its own kind has no noun: "the wettest" for an October among Octobers, a spring or a month so far, and "the wettest in spring" for 7 days among spring's. "October was the wettest October" would say it twice.
  - Months among all months and years keep theirs: "the third hottest month", "the hottest year", and for the year so far "so far the third hottest year", since "start to the year" reads oddly by November.
  - A period's minimum is its nights: "the warmest nights" (the site says "October had…"), or "the month with the coldest nights" among all months.
  - A since is a day for a run of days ("since 8 February"). For months among all months it is a month ("since March", "since March 2025") or a year. Everything else is compared once a year, so its since is a year.

### The sentence

`sentence` in `src/site/naming.ts` makes the sentence for when the page is viewed, in Sydney time. It has three parts, so the page can set the day apart.

- **Subject:** "Today", "Yesterday", its day of the week within 6 days, otherwise a date ("12 October"). A minimum is for the 24 hours to 9am, so it names the night that ends on its date by its evening: "Last night", "Tonight", "Thursday night", "The night of 2 November". A forecast or a running value for last night is for the night still under way after midnight, so it is named by its day of the week: "Sunday night is forecast to be…", "Sunday night is the coldest since 2007". A day's rain is "The 24 hours to 9 am Friday". A fact for the day of the week would say the day twice ("Thursday was the hottest Thursday"), so a day or night that would be named by its day of the week is named by its date instead: "5 November was the hottest Thursday since 2019", "The night of 5 November was the coldest Thursday night". Today, yesterday, tomorrow, last night, tonight and tomorrow night keep their names, and so does a day's rain, whose day of the week is the day before its 9am. Periods are "October", "October 2025" in another year, "The 3 days to Tuesday", "November so far", "Spring", "2026" for the year so far, and "2025".
- **Verb:** "is" or "was" by whether the day is over. A night, the rain to 9am and the 9am readings are over by the time the page shows them, unless the value is still running, which isn't over until its 9am. Rain days and runs of days take "were". Measures that aren't a kind of day take "had": changes, ranges, humidity and the 9am and 3pm readings ("Thursday had the lowest peak humidity"). A period's nights take "had", "has had" or, for the year so far, "has so far had". Forecasts are "is forecast to be".
- **Value**, with its unit from the measure: "with a top of 23.6 °C", "with a low of 11.6 °C", "with 49.6 mm", "up 6.7 °C" for a change, "at 79%", "with an average top of 23.6 °C" for a period. Observed values show one decimal, forecasts whole degrees as BOM gives them.
- **Provisional:** shown exactly like a confirmed fact, with no words and the same dot ("Observed" in the legend). The live feed is treated as fact.
- **Partial:** worded like an observed fact, with no words of its own: "Today is the hottest day since February, with a top of 31.2 °C". Its dot is a ring with a smaller dot inside, an observed dot not yet filled out ("So far" in the legend). The headline has no dot, so a running headline has the mark and "So far" beneath it, with the halo or pulse its dot would have in a list. Screen readers hear "So far" before the sentence.
- **Conditional:** built around what it needs: "A low of 10 °C tonight (forecast 12 °C) would make it the coldest night in November since 2006", "A top of 36.6 °C on Thursday (forecast 35 °C) would make it…", "90.1 mm in the 7 days to Sunday (forecast 70 mm) would make them…". A single day's rain is a chance: "The 24 hours to 9 am Monday have a 25% chance of being the wettest since 4 November, with 20 mm or more".

### Standout marks

The site marks the facts that stand out in their section by their dot (`standout` in `src/site/arrange.ts`). A fact is **notable** if it scores at least log(2) more than a day's further facts need in the section it was chosen for, so it is at least twice as rare as the section asks: from about 3.19 in Today, 4.19 in Past week, 5.69 in Past month and 5.19 in the coming week. A conditional fact is never marked, since it may never happen. A forecast in Today keeps the coming week's bar. Any fact scoring 6.5 or more is **exceptional**. That is about a once-in-2-years day for one measure, but across every measure a location has one about every 3 months. On one day a month from 2021 to 2025, a pulse showed somewhere on the page on 21 of 61 days at Observatory Hill, 22 at Sydney Airport and 14 at Olympic Park. These are raw scores, the same for a day and a calendar period, so in Past month and Past week a mark always sits at the top of the list. A calendar period scores too little to be exceptional, even as an all-time record. A notable fact's dot has a faint halo, and an exceptional fact's glows slowly brighter and dimmer. The glow surrounds the dot, so its shape still shows the fact's status. It pauses when the tab is hidden and stands still with reduced motion. The headline has no dot, since its size already shows its score, apart from a running headline's So far mark (see Partial above). Screen readers hear "Notable" or "Exceptional" before the sentence, including on the headline. On the snapshot windows these mark 27 of 59 facts, 7 of them exceptional, since the windows were chosen for their extremes. On 9 November 2026, an ordinary week, they marked only Observatory Hill's wettest November day since 2018 and Olympic Park's warmest night since 21 March, both in Past week.

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
- **Selection:** a turning point is news for about a week either side. It goes in Today on the page's date, in Past week for the 6 days before, and in the coming week for the 7 days after the window's end (`daylightAround`), never in Past month. Turning points are at least 9 days apart, so each section has room for every one in its days, on top of its weather facts.
- **Wording:** `describeDaylight` gives "the longest day of the year" or "the earliest sunrise of summer". The site's `daylightSentence` adds the day and its value: "Thursday has the earliest sunrise of summer, at 5:37 am", "Friday had the latest sunset of the year, at 8:10 pm". A solstice gives its daylight: "Today is the longest day of the year, with 14 hours 25 minutes of daylight".
- **On the page:** a daylight fact has its own mark, a half-filled dot ("Daylight" in the legend), since it is neither observed nor forecast. It never gets a standout mark, since it comes round every year. It has no `why`: `facts.json` gives its `event`, `scope`, and its day's `sunrise` and `sunset` to the minute.

Every fact in `facts.json` has a `kind`: `record` for the ranked facts above, and `daylight`.

## Trying it out

- `npm run smoke:facts [location-id] [date] [max-rank]` prints one day's candidate facts.
- `npm run smoke:sections [location-id] [date]` prints the three sections for the 31 days to a date, with day, period and daylight facts.
- `npm run smoke:forecast [location-id]` downloads the live forecast and prints the coming week. With a date as well, it prints the coming week that a 10:30am run that day would have seen, if the forecast had matched what was observed: the data stops the day before, and the rain amounts with a 25% chance are 1.5 times the observed rain.
- The snapshot tests in `test/selection.test.ts` record the sections for five real windows, so any change to the scoring shows up as a diff to review.
