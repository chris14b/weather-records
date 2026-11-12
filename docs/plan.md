# Build plan

The open tasks, in order of priority. Background and settled decisions are in [CLAUDE.md](../CLAUDE.md). How the pipeline reads data is in [pipeline.md](pipeline.md), and how it makes facts in [facts.md](facts.md).

## How to use this plan

- Each task has a permanent ID, such as `T15`. An ID is never reused or renumbered, and never has a letter after it (no `T5b`). A new task, including one split off another, takes the next ID, and goes where its priority puts it. Its place in the list, not its ID, sets its priority.
- **Next ID:** T48
- **Depends on** lists the tasks that must be finished first. A task that is no longer in this plan is finished. Keep every task below the tasks it depends on.
- The next task is the first one that isn't deferred or blocked and whose dependencies are all finished.
- Statuses: `todo`, `in progress`, `blocked` (say on what), `deferred` (skip until the user says otherwise). An open task can have **Notes** for whatever a later session needs.
- **When a task is finished, delete it from this plan**, in the same commit as the work. Before deleting it, move anything later sessions need:
  - instructions for an open task go into that task
  - lasting knowledge about the data or the code goes into [pipeline.md](pipeline.md) or [facts.md](facts.md)
  - decisions go into [CLAUDE.md](../CLAUDE.md)
  - history, such as what was tried and dropped, goes in the commit message. Git keeps the old plan (`git log -p --follow -- docs/plan.md`).
- Refer to tasks by ID, and never to a finished one.

---

## T42: Records for the day of the week

**Status:** todo

**Goal:** Facts that compare a day with the same weekday, such as "the wettest Saturday since 2022", if they turn out worth showing.

- Background: CLAUDE.md's Facts section says not to compare against the same weekday, and no code for it was ever written. The user asked for it on 2026-11-09, so this reverses that decision: update CLAUDE.md in the same change.
- Background: the weather doesn't know the weekday, so any weekday holds about a seventh of the days and sets a record about as often as a calendar month does. The interest is in the reading ("the wettest Saturday since 2022" matters to weekend plans), not the rarity, so the weight is a judgement, like the calendar date's in `comparisonWeights`.
- Scope: a `weekday` comparison in `Comparison` (`src/shared/facts.ts`), keyed by `comparisonKey` in `daily-facts.ts`, for days only: not runs of days or calendar periods. Decide which measures get it, perhaps only the maximum, the minimum and rain.
- Scope: scoring within the Scoring section of [facts.md](facts.md): a weight in `comparisonWeights`, and whether its since needs a rule like `previousOccurrence`, since "the wettest Saturday since 31 October" is only a week.
- Scope: wording. A day is "the wettest Saturday", and a night or a day's rain is credited to the day it ends on, so decide how to name them: "Friday night was the coldest Friday night…" says it twice.
- Done when: tests cover the comparison, its scoring and its wording, the selection snapshots have been reviewed for how often weekday facts win, and CLAUDE.md is updated.

---

## T20: Backfill the 9am and 3pm readings

**Status:** todo

**Goal:** Give the 9am and 3pm facts about a year of history, from BOM's Daily Weather Observations (DWO), and make DWO the way to fill any gap that missed runs leave.

- Background:
  - DWO keeps the current month and the 12 before it, one CSV per station per month, at `https://www.bom.gov.au/climate/dwo/YYYYMM/text/<product>.YYYYMM.csv`. The CSV columns include 9am and 3pm temperature and relative humidity.
  - These are on BOM's website, so the user downloads them by hand in a browser. Code must never fetch them.
  - `IDCJDW2124` is Sydney, and its temperature and humidity come from Observatory Hill (066214). The user also found `IDCJDW2125`. Find the products for Sydney Airport and Sydney Olympic Park, and check which station each file's header names.
  - Use only the temperature and humidity columns. The Sydney file takes its cloud and pressure from Sydney Airport and its wind from Fort Denison.
- Scope: give the user the list of files to download, and add it to [refreshing-history.md](refreshing-history.md).
- Scope: a parser for the DWO CSVs, which checks that the header names the expected station.
- Scope: adding the downloaded readings to the saved readings in `data/recent/readings/`, for any date in the last 13 months that is missing: before saving began, or in a gap left by missed runs. On overlapping dates the two must agree, or the build fails. The pruning to 13 months (`readingsKeptFrom`) applies to these readings too.
- Scope: a way to see which dates the saved readings are missing, so the user knows which months to download. Add the steps to [refreshing-history.md](refreshing-history.md).
- Done when: tests cover parsing, the station check, the overlap check and filling a gap, and the 9am and 3pm records start about a year earlier.

---

## T19: Wind

**Status:** todo

**Goal:** Wind facts such as "the 8th windiest day this year", for the locations where BOM's feeds allow them.

- Background, checked on 2026-10-30:
  - The FTP daily files have a column for the day's average 10 m wind speed (m/s). It holds real values for Sydney Airport (files from 2009) and Sydney Olympic Park (from 2011).
  - Observatory Hill reports `0.00` every day because it has no wind instrument: BOM measures Sydney's harbour wind at Fort Denison instead. Treat those zeros as missing, never as calm, so there are no wind facts for Observatory Hill.
  - The ZIPs don't include wind, and no allowed source has a history of gusts.
- Scope: a one-off backfill of the wind column from every FTP daily file since each station's first file, saved in a committed file per station (e.g. `data/wind/<station>.csv`), or as a column in `data/ftp-history/`. Keep it up to date from the files the daily run already downloads. It is never pruned, because no ZIP replaces it.
- Scope: wind measures for the fact generator, with every comparison that has enough history, within the ranking, scoring and wording in [facts.md](facts.md) ("windiest", "calmest").
- Scope: update the data sources section of CLAUDE.md.
- Out of scope, so ask the user first: saving each day's maximum gust from the live feed. Its records would only begin on the day saving starts.
- Done when: tests cover the parsing, the backfill, and the rule that Observatory Hill's zeros count as missing.

---

## T43: Forecast day-to-day changes

**Status:** todo

**Goal:** Facts about the forecast's rises and drops in the maximum and minimum, such as "Thursday is forecast to have the biggest drop in maximum temperature since 2017" after a 38 °C Wednesday and a 22 °C Thursday.

- Background: observed changes are ranked (`maxTempChange` and `minTempChange`, from `changeSeries` in `series.ts`), but `forecastSeries` in `forecast-facts.ts` only adds the forecast's days to the maximum, minimum and rain series. So a forecast southerly buster gets no change fact, though it is often the most interesting thing in the coming week.
- Scope: change facts for each forecast day, from `changeSeries` over the maximum and minimum with the forecast added. The first forecast day's change is from the last observed day, and every later one from the forecast day before. Like the forecast's other days, each is ranked against the observed changes and the forecast's earlier ones, with the status `forecast`.
  - A running value isn't in the series (see Values still running in [facts.md](facts.md)), so today's forecast maximum is compared with yesterday's observed maximum until 9pm. Check that `withoutOvertaken` handles a change, or leave today's change out while today's maximum is still running.
- Scope: no "what it would take" facts for changes to begin with. The reach of 2 °C either side applies to one day's value, and a change moves with two. Decide later whether they're worth having.
- Scope: wording. `verb` in `src/site/naming.ts` gives forecasts "is forecast to be", but a change takes "had" (`isHad`), so a forecast change needs "is forecast to have".
- Scope: selection within the forecast's allowance (the Selection section of [facts.md](facts.md)). Changes have a family of their own, so they don't push out the day's "coldest day" fact.
- Done when: tests cover a forecast change from the last observed day, one between two forecast days, and the wording, and [facts.md](facts.md) has the changes under Forecasts.

---

## T44: Forecast rain over 3 days

**Status:** todo

**Goal:** Facts about the forecast's wettest 3 days, such as "The 3 days to Sunday are forecast to be the wettest since 2022", beside the existing 7-day total.

- Background: observed rain is ranked over runs of 3 and 7 days (`rollingDays` in `period-facts.ts`), but the forecast only over its first 7 days (`runDays` in `forecast-facts.ts`). A wet weekend inside an otherwise dry week then gets nothing.
- Scope: every run of 3 forecast days, credited and totalled as the 7-day run is (see Rain over the next 7 days in [facts.md](facts.md)), and ranked with `runRanker` against all runs, the same season and the same month. A day with no rain range and a chance of 50% or more leaves any run holding it unknown.
- Scope: "what it would take", as for the 7 days: up to the total of the amounts with a 25% chance.
- Scope: decide whether a run may start on observed days and end on forecast ones, such as the 3 days to tomorrow, when yesterday was wet.
- Scope: selection. Overlapping 3-day runs, and a 3-day run inside the 7, would say much the same thing. Check that the spell rule (`isPartOfSpell` in `selection.ts`) keeps only the strongest, and that the coming week isn't filled with rain.
- Background: T38 asks whether the 10:30pm run's forecast should leave day 0 out of its rain. That applies to these runs too.
- Done when: tests cover a wet run inside a dry week, a run left unknown by a missing range, and the selection beside the 7-day total, and [facts.md](facts.md) is updated.

---

## T45: Hot and cold spells

**Status:** todo

**Goal:** Facts about runs of days by their mean temperature, such as "The 3 days to Tuesday were the hottest since 2019" or "the coldest 7 nights since July 2025".

- Background: runs of days are ranked for rain only (`rolling` in `generatePeriodFacts`, `period-facts.ts`). The ranking, the overlap rule and counting each spell once already work for any measure (see Runs of days in [facts.md](facts.md)). This is a different thing from T22: a spell's mean needs no temperature threshold.
- Scope: runs of 3 and 7 days for the mean maximum and the mean minimum, in both directions: hot and cold days, warm and cold nights. Compare them with all runs, the same season and the same month, as for rain.
- Scope: every day of a run must have a value, as for rain, since a missing day might have been the hottest. Means are rounded to 0.1 °C, as for calendar periods.
- Scope: a rule in place of rain's spell rule, which needs a run to start and end wet. A run should get facts only when it says more than a shorter run inside it, so one hot day with two ordinary ones either side isn't "the hottest 3 days". Record the rule in [facts.md](facts.md).
- Scope: the 2020 Observatory Hill station change. A mean over a few days is more sensitive to the change than one day's extreme, so compare it both ways, as for calendar periods' means (`offsets` from `stationOffsets`).
- Scope: wording. A run of minimums is its nights: "The 3 nights to Tuesday were the warmest since…". Check `hasNights` and `sentence` in `src/site/naming.ts`.
- Scope: selection. Runs of days compete with each other within a family, so check that a hot spell and the hottest day in it don't both show, and that heat doesn't push the rain spells out of Past week.
- Out of scope, unless it turns out easy: the forecast's hot and cold spells. Otherwise add them to the plan as a new task.
- Done when: tests cover a hot spell, a cold run of nights, a run with a missing day and the new rule, the selection snapshots have been reviewed, and [facts.md](facts.md) is updated.

---

## T46: More statistics for months, seasons and years

**Status:** todo

**Goal:** More facts for calendar periods, such as "October was the sunniest October since 2009" or "Spring had the most rain days since 2016".

- Background: months, seasons and years, complete and so far, are ranked only by total rain, mean maximum and mean minimum (`periodMeasures` in `period-facts.ts`).
- Scope: choose from these with the user, and add the ones chosen:
  - **Mean temperature**, the average of the maximum and the minimum, which is what BOM's monthly climate summaries lead with ("the warmest October on record").
  - **Rain days**, the days with at least 1 mm, BOM's own measure of a rain day, so it needs no threshold of our own. Like the total, it needs every day to have a value.
  - **Mean solar exposure**, from 2009 (2011 at Olympic Park), and longer once T21 is done. Observatory Hill has none from 2018-04 to 2020-07. Wording: "sunniest" and "dullest", or "cloudiest".
  - **Mean temperature range**, from `range`. Very sensitive to the station change: 066214's range is about 0.6 °C wider than 066062's.
  - **Mean humidity**, from the FTP daily files' highest and lowest relative humidity, from 2009.
- Scope: the missing-days rules (see Missing days in [facts.md](facts.md)): the temperature means follow the WMO rule for months, and counts and totals need every day.
- Scope: the 2020 Observatory Hill station change. Mean temperature has an offset of about 0 °C (+0.3 °C and −0.3 °C), and the range about +0.6 °C. Compare both ways, as the mean maximum and minimum are.
- Scope: families in `selection.ts`, so a month shows one temperature fact rather than "the warmest", "the warmest days" and "the warmest nights" together. Decide which family mean temperature and the range belong to.
- Scope: wording for each, without repeating the subject ("October had the most rain days since 2016").
- Done when: tests cover each new measure, its missing days and its wording, the selection snapshots have been reviewed, and [facts.md](facts.md) is updated.

---

## T47: Forecast temperature range

**Status:** todo

**Goal:** Facts about the forecast's temperature range, such as "Saturday is forecast to have the biggest temperature range since March".

- Background: observed ranges are ranked (`range`, the day's maximum minus its minimum), but `forecastSeries` in `forecast-facts.ts` only adds the forecast's days to the maximum, minimum and rain series, so the forecast has no range facts.
- Scope: a range for each forecast day, from its forecast maximum minus its forecast minimum, the night that ends that morning, as for observed days. Today's forecast has no minimum, so today's range takes the observed minimum and the forecast maximum, with the status `forecast`. Rank each against the observed ranges and the forecast's earlier ones, in both directions.
- Scope: no "what it would take" facts, as for T43's changes: a range moves with two values, and the 2 °C reach is for one.
- Scope: wording. A range takes "had" (`isHad` in `src/site/naming.ts`), so it needs the "is forecast to have" that T43 adds for changes. If this is done before T43, add it here.
- Scope: selection within the forecast's allowance. The range is a family of its own, so it doesn't push out the day's "hottest day" fact, but check that it doesn't crowd the coming week either.
- Done when: tests cover today's range from an observed minimum, a range between two forecast values and the wording, and [facts.md](facts.md) has the range under Forecasts.

---

## T28: This year

**Status:** todo

**Goal:** A This year section with the standout months and seasons of the past 12 months, such as "February was the hottest February since 2012".

- Background: the pipeline already ranks complete months, seasons and years, and the current ones so far (the Periods section of [facts.md](facts.md)). It drops a complete period once it ended more than 31 days ago, and shows the rest in Past month under `calendarRule`.
- Scope: a `thisYear` section in `PageFacts` for the complete months and seasons that ended in the last 12 months, and the year so far. Decide whether calendar periods leave Past month for it, or Past month keeps the latest complete month.
- Scope: selection rules of its own in `selection.ts`, within the Selection section of [facts.md](facts.md), so a strong month stays for the year but doesn't crowd the section.
- Scope: a This year panel on the page, after Past month, with its periods named as the site names the others.
- Done when: tests and the selection snapshots cover the section, and it has been checked in the browser.

---

## T37: More forecast icon looks

**Status:** todo

**Goal:** The weather sky tells apart the forecasts Sydney actually gets that now share a look.

- Background: `weatherForIcon` (`src/shared/weather.ts`) maps BOM's 17 icon codes onto 8 kinds of sky. Light showers, showers and heavy showers look the same, and haze and dust borrow the grey fog.
- Scope: light, ordinary and heavy rain, by the density of the rain layer, for showers (codes 17, 11 and 18) and rain (8 and 12).
- Scope: a brownish-orange tint for haze and dust (codes 6 and 13), since bushfire smoke haze is common in Sydney, separate from fog (10).
- Out of scope: snow (15), tropical cyclone (19) and frost (14), which Sydney almost never gets. Their current looks stay.
- Scope: check the rain and storm skies on a real phone. The glass panels re-blur everything moving behind them on every frame, which headless measurement doesn't capture. If they stutter or drain the battery, slow or thin the rain on small screens.
- Done when: each new look has been checked in the browser by day and night, and with reduced motion.

**Notes:**

- With `npm run dev`, `/?sky` opens a panel that sets the sky to any date, time and kind of weather. Add the new looks to its weather list (`weathers` in `src/shared/weather.ts`).

---

## T12: Near-miss facts

**Status:** todo

**Goal:** Facts about observed days that fell just short of a notable rank, such as "yesterday came within 0.2°C of the hottest October day since records began".

- Scope: for each observed day and comparison, find the nearest rank or "since" boundary above its value, and how far away it is, using the Ranking section of [facts.md](facts.md).
  - The function exists: `boundariesBetween` in `thresholds.ts` gives the earlier values between two values, nearest first, and `justBeyond` the value 0.1 past one. The nearest boundary above a day's value is `boundariesBetween(values, value, Infinity, direction)[0]`.
  - Decide what counts as near: a gap in the measure's own units, or a share of the spread of the comparison's values.
- Scope: scoring and wording within the existing ones (the Scoring, Selection and Wording sections of [facts.md](facts.md)), so a near miss never outscores a real fact for the same day, and isn't shown beside it for the same measure.
- Done when: tests pass for a near miss against a record, against a "since" year, and against a gap in the data, and the real data gives a near miss on a chosen day.

---

## T41: README

**Status:** todo

**Goal:** Document the project.

- Scope: a README covering what the site is, how to refresh the ZIPs once a year (link to [refreshing-history.md](refreshing-history.md)), how to run the site locally, and the attribution.
- Done when: the README is written.

---

## T18: Retuning

**Status:** blocked (on a couple of weeks of output from the scheduled runs, which started on 2026-11-10, so not before about 2026-11-24)

**Goal:** Tune the facts against real output.

- Scope: a pass over scoring, selection and wording, using the output of the scheduled runs. The constants are `sectionRules`, `calendarRule` and `conditionalRule` in `selection.ts`, and the weights in `scoring.ts`. Weak spots found so far:
  - Past week is often filled by short sinces such as "the coldest night since 20 October". These are true, but much alike from day to day.
  - Year-so-far ranks such as "the 9th wettest day of the year so far" or "the 7th biggest day-to-day drop in maximum temperature of the year so far" still get in at around 2.4.
  - Quiet days give Today nothing at all, as on 2026-10-30, whose only data is a minimum and rain.
  - Observatory Hill's year so far leaves out 9 to 16 years between 1864 and 1948, each with a month or so missing, so its records carry "(not counting 16 years with gaps)". That is still long for a headline. Allowing a missing month in a year so far might be fairer.
  - A period so far shows every day until the period ends, so it can sit in Past month for months.
  - Facts for the calendar date now score their sinces and ranks below the top (weight 0.8), so most days have one. Check they don't crowd Past week, and whether the 2020 Observatory Hill station change (minimums about 0.3 °C cooler) makes its "coldest for 9 November since…" nights too easy, since day facts don't take the station offset out.
  - The coming week's fallback (`forecastFloor`) can pick a conditional fact over a plainer forecast one, such as "A top of 18°C on Friday (forecast 20°C) would make it the coldest day since 3 November". Decide whether a fallback should prefer forecast facts.
- Done when: the retuning is reviewed with the user and the snapshot tests updated.

---

## T26: Fact cards

**Status:** todo

**Goal:** Each fact as a card that can explain itself.

- Scope: an expandable "why" on each card, from the fact's `why`: the value, its rank, ties and days compared, the previous record holder, the since, missing days and gaps, and for a conditional fact the forecast. Values in `facts.json` have no units; `amount` in `src/site/naming.ts` adds them from the measure.
- Scope: a small chart of the why's `leaders` (the 10 best comparable days or periods), with the fact itself marked. Decide between hand-written SVG and a charting library, keeping the page light.
- Done when: tests cover the formatting, and the cards have been checked in the browser for a day fact, a period fact, a forecast fact and a conditional fact.

**Notes:**

- Each fact is an `li.fact` built by `factItem` in `src/site/render.ts`, and the big fact by `headline`. Open the why without pushing the panels around much, e.g. as a popover over the glass.
- A running fact (`status: "partial"`) has `observedAt`, the time its value was read, which the why can show ("31.2 °C by 2:30pm"), since the sentence doesn't.
- A daylight fact (`kind: "daylight"`) has no `why`. Decide whether it needs one, e.g. its sunrise and sunset or the days around it, or no card at all.

---

## T27: Finishing the site

**Status:** todo

**Depends on:** T26

**Goal:** The site handles every location, state and screen well.

- Scope: default to the nearest location using browser geolocation. Coordinates are never sent anywhere. The location in the address wins, then one the user chose, which is already remembered, then the nearest. The order is `startingLocation` in `src/site/address.ts`.
- Scope: a banner when the data is stale, from `generatedAt`. Runs are every 2 hours from 6:30am to 10:30pm, so the longest gap is 8 hours overnight. Decide how old is too old. The footer already says when the next update is due, then that it is running late, then that updates are running late once a second run is due (`updateNote` in `src/site/updates.ts`), so the banner is for data too old to trust, such as a day or more, not for one late run.
- Scope: empty and error states: `facts.json` missing or malformed, a section with no facts, a quiet day with nothing in Today.
- Scope: dark mode, and accessibility, including the charts.
- Scope: a pass at phone widths. Desktop stays the main design, but the page must be easy to read and use on a phone.
- Done when: it has been checked in the browser at desktop and phone widths, in light and dark mode.

**Notes:**

- The page is already white text on dark glass over the sky, so decide what dark mode should change, if anything, beyond a darker sky.
- On a phone, the location toggle wraps onto two lines, and the headline's size is capped by the viewport width (`headline` in `src/site/render.ts`).
- Empty sections already show a line such as "Nothing notable in the forecast.", and an empty Today shows "Nothing notable yet today." If `facts.json` fails to load, the page shows one line of text.

---

## T33: Today's forecast and the latest reading

**Status:** todo

**Goal:** Today shows BOM's forecast for the day, and the latest reading the run saw, clearly labelled with its time.

- Background: the user asked for the current temperature. The site can't show a truly current one: `facts.json` is written every 2 hours from 6:30am to 10:30pm, there is no server, the browser can't reach BOM's FTP, and code must never fetch from BOM's website or app API. The honest version is the latest reading at the time of the run, such as "18.4°C at 10:30am", from IDN60920, which the pipeline already downloads. It is up to about 2 hours old by day and 8 hours old overnight, so decide with the user whether it is worth showing, and whether to hide it after the last run.
- Scope: add each day's minimum, maximum, chance of rain and rain range to the `forecast` field of each location in `facts.json`, which already gives each day's icon code and précis.
- Scope: show today's forecast in Today, near the headline, and decide whether the Coming week shows each day's forecast beside its facts.
- Scope: after 9pm the day's forecast is spent, so show tomorrow's, as `forecastStart` does.
- Done when: tests cover the new fields, and it has been checked in the browser for a morning and an evening `facts.json`.

---

## T38: Check the update runs

**Status:** todo

**Goal:** Each scheduled run starts on time and gets the data it is timed for.

- Scope: once cron-job.org starts the runs ([starting-runs.md](starting-runs.md)), check from its history and GitHub's run history that each slot gets a `workflow_dispatch` run within a minute or two. The first was cron-job.org's test run at 9:47am on 2026-11-13, which started within seconds and deployed by 9:49am.
- Scope: check that a scheduled run commits only when the data changed, and that a push run, which also builds the data, still deploys and commits cleanly when the scheduled run has moved `main` on.
- Scope: from the commits and logs, check that the 10:30am run had last night's minimum, the rain to 9am, the 9am reading and that morning's daily files, that the 4:30pm run saved today's maximum and the 3pm reading, that the later runs overwrote the maximum, and that the 10:30pm run had the maximum from its closed window and BOM's 10pm (11:00 UTC) forecast. If the logs can't show it, have `build:data` print each feed's issue or observation time.
- Scope: check that the 10:30pm run handles the 11:00 UTC forecast issue, whose day 0 is today with nothing left in it. No such issue had been seen by 2026-11-09. If the parser rejects it, every 10:30pm run fails. If day 0 has a low chance and no rain range there, `forecastRain` counts it as 0 mm, so the 7-day total treats the rest of today as dry; decide whether to leave day 0 out of that issue's rain.
- Scope: without daylight saving, from April 2027, BOM's schedules come an hour earlier by Sydney's clock. Check one 10:30am run then. If everything else is done before that, defer this part rather than holding the task open.
- Done when: the runs are shown to get their data, or the times or the pipeline are changed so they do.

**Notes:**

- The run times and their reasons are in CLAUDE.md. BOM's forecast schedule there comes from search results quoting its announcement (its site refuses automated requests), and matched the feed on 2026-11-09. The latest observations appeared about 5 minutes after the half-hour then.
- GitHub's docs say a run in an hour skipped by daylight saving moves to the next valid time. No run is between 2am and 3am, so it shouldn't matter.
- GitHub's own schedule, removed on 2026-11-13: its `timezone` field worked, but from 9 to 13 November 2026, six of its eight scheduled runs started 5–51 minutes after a Sydney slot, which read as UTC would be 1–4 hours late. The other two came 2 h 43 m and 5 h 52 m after the 10:30pm slot. The other 25 slots got no run at all. Every run succeeded. The 10:30pm slot ran at 10:35pm on 10 November and 10:41pm on 12 November, after the 11:00 UTC forecast issue, so the parser accepted those issues. Run logs need a signed-in browser, but the public API (`api.github.com/repos/chris14b/weather-records/actions/runs`) gives each run's event and start time without signing in. `gh` belongs to the work account, so don't use it here.

---

## T21: Longer solar history from the IDCJAC0016 ZIPs

**Status:** todo

**Goal:** Solar history back to about 1990 from BOM's free daily solar exposure ZIPs (product `IDCJAC0016` in Climate Data Online), instead of only from 2009 (2011 at Olympic Park). The user wants this done after the site is live.

- Background: `data/ftp-history/` holds the FTP daily files' solar values since 2009. Climate Data Online also has a daily solar exposure ZIP for each station, which may hold the same values over a much longer period. It is on BOM's website, so the user downloads it by hand. Code must never fetch it.
- Scope: list the download links for 066062, 066214, 066037 and 066212 in [refreshing-history.md](refreshing-history.md), and wait for the user to download them. A station's page is `https://www.bom.gov.au/jsp/ncc/cdio/weatherData/av?p_nccObsCode=193&p_display_type=dailyDataFile&p_startYear=&p_c=&p_stn_num=<station>`, with **All years of data** at the top right (the `193` is unconfirmed).
- Scope: check that the ZIPs match the FTP solar values on the dates they share.
  - If they do, load them like the other ZIPs (the CSV columns probably differ, so the loader needs that product's headers), and layer them ZIP first, then the FTP history, like the temperature ZIPs.
  - If they don't, record why in [pipeline.md](pipeline.md) and keep the FTP values only.
- Scope: update the data sources section of CLAUDE.md, and the solar history's start in the Series section of [facts.md](facts.md).
- Done when: the comparison is recorded, and either the solar series starts about 1990 with tests covering the loader and layering, or the reason it doesn't is recorded.

---

## T23: The 2020 Observatory Hill station change

**Status:** todo

**Goal:** Decide how facts compare values across the Observatory Hill station change, so the site never claims a record that only the change made. Research first, then agree the approach with the user before changing code.

- Background, found on 2026-11-06:
  - The two stations recorded side by side from 2017-10-18 to 2020-08-31, and both ZIPs hold those days (1,045 shared days for temperature, 1,030 for rain).
  - Maximum: 066214 reads +0.34°C higher on average, but the gap is seasonal: about +0.5 to +0.8°C in summer (December +0.77) and about +0.1°C in winter. On days above 30°C the two agree (−0.03°C on average), so daily heat records aren't inflated. Daily differences vary widely: 5% to 95% of days fall between −0.6 and +1.9°C.
  - Minimum: 066214 reads −0.27°C lower, steadily all year (−0.14 to −0.35°C by month).
  - Rain: 066214's gauge caught about 6% more (3,228 mm against 3,050 mm). Most days are identical.
  - What the code does now: mean temperatures over periods are compared both as measured and with a flat offset taken out (`reads` on 066214 in `locations.ts`: +0.3°C maximum, −0.3°C minimum), and a fact must hold both ways. Daily facts and rain compare the stations as one series. See the Periods section of [facts.md](facts.md).
  - A forum post quoting the station history says 066214 became the main site in October 2017. BOM's own pages found so far say only that 066062 closed on 2020-08-31 and 066214 opened in 2017. No BOM write-up of the changeover was found.
- Research first, and report to the user before any code:
  - Find BOM's own account of the change, especially the ACORN-SAT station catalogue's entry for Sydney: when 066214 became the primary site, and what difference BOM measured.
  - Check which station the FTP daily folder `sydney_(observatory_hill)` followed from 2017-10 to 2018-03, by comparing those months' temperatures with each ZIP. A cutover in October 2017 would otherwise credit 066062's humidity and solar to 066214.
  - Decide whether the overlap is long enough to trust for rain, and for monthly rather than seasonal offsets.
- Options to put to the user. The cutover date and how comparisons cross it are separate choices.
  - Cutover: keep 2020-09-01, or move it to October 2017 if BOM confirms that date. Moving it lengthens the new station's own record and may match BOM's, but the stations still differ across the join wherever it falls.
  - Comparison:
    1. No handling: compare the raw joined record, as BOM publishes it, and rely on the site's note.
    2. Measured offsets, applied cautiously: keep the both-ways rule for period means, with seasonal offsets measured from the overlap instead of a flat 0.3°C. Extend it to daily minimums, and decide about rain.
    3. Restart averages at the new station: compare monthly, seasonal and yearly means only within 066214 ("since 2017"), and keep daily extremes joined.
  - Claude's suggestion on 2026-11-06 was the October 2017 cutover, if BOM confirms the date and the FTP check is clean, with option 2. Option 3 is the alternative if the site should never depend on an offset.
- Scope, once decided: the config, and a test that recomputes any offsets from the overlap in the ZIPs, so a yearly refresh flags drift. Update CLAUDE.md's Locations section, [facts.md](facts.md) and the snapshot tests.
- Done when: the research is recorded, the user has chosen, and tests cover the chosen handling.

---

## T29: Daily values and a timeline strip

**Status:** deferred (the user may want it later)

**Goal:** A strip of the past month's days and the coming week under the big fact, each day shaded by its temperature, with facts pinned to their days.

- Background: `facts.json` has only facts, so the page knows nothing about days without one. A design with the strip as the whole page was put to the user on 2026-11-09, with one where the background is a stripe per day coloured by its maximum. The user chose the glass panels, and may want the strip, or the stripes, later.
- Scope: each location's daily maximum, minimum and rain in `facts.json` for the 31 days of the sections, with each value's status, and the forecast for the coming week. Keep the file small.
- Scope: the strip, with today marked and forecast days set apart. Selecting a day shows its facts.
- Done when: it has been checked in the browser, including days with missing values.

---

## T22: Streaks

**Status:** deferred

**Depends on:** T23

**Goal:** Facts about runs of days, such as "the 12th dry day in a row, the longest dry spell since 2019" or "the 5th day in a row above 30°C".

- Scope: decide what counts as a dry day, a hot day and a warm night, without hand-set temperature thresholds, so that it would work anywhere in Australia (see the notes). Record the choice in [facts.md](facts.md).
- Scope: streaks must not run through gaps. A missing day ends a streak.
  - A multi-day rain total is never a single day's value. Decide whether a 0 mm total, which shows that every day it covers was dry, may count towards a dry spell.
- Scope: ranks and "since" for streak lengths, using the `Period` type in `src/shared/facts.ts` with a streak kind. Equal lengths share a rank.
- Scope: wording for a streak still running, which may grow on later days, and for one that has ended.
- Scope: scoring and selection within the existing ones (the Scoring and Selection sections of [facts.md](facts.md)), so a long streak doesn't appear afresh on every day it runs.
- Scope: streaks of cold days and cold nights too.
- Done when: tests pass for streaks that meet a gap, a streak still running, and streaks of equal length.

**Notes:**

- A working version is on the branch `streak-facts` (pushed to `origin`). It adds `src/pipeline/streak-facts.ts` with tests, the streak wording and selection, and a section on streaks in [facts.md](facts.md), which on `main` belongs under Ranking beside Periods. Its copy of this plan has the full notes under its task 11. Rebase it onto `main` before reusing it, and expect the selection snapshots to need a fresh review.
- The branch handles dry days (0 mm, at least 5 in a row), maximums of 30°C or more (3) and 35°C or more (2), and minimums of 20°C or more (3). A missing day ends a streak, a streak that starts after one gets no facts, and a 0 mm multi-day total counts as dry days. It scores on the days' scale with no extra weight, and selection shows only each streak's latest day. It found real records: Observatory Hill's 7 days of 30°C or more from 18 to 24 December 2025 equal its longest run (2011). It takes about 0.25 s per location.
- Problems to solve before picking it up again:
  - **Fixed temperature thresholds.** The user doesn't want hand-set degrees, because the site may one day cover all of Australia. Two alternatives were put to the user, and neither was chosen:
    1. Each location's own percentiles over 1991–2020, rounded to whole degrees. The wording stays concrete, but neighbouring locations get different numbers, and hot streaks only happen in summer. The branch's numbers are close to Observatory Hill's: maximum 95th percentile 30.2°C, 99th 35.3°C, 10th 17.3°C; minimum 90th 20.6°C, 10th 8.6°C. Olympic Park's are 33.6, 38.9, 17.8, 19.9 and 5.7°C.
    2. Claude's suggestion: percentiles for the time of year, like the climate indices TX90p and TN10p (the 90th percentile of the days within about a week of each date, 1991–2020). This gives warm days, cool days, warm nights and cold nights in any season and anywhere, worded as "the 5th unusually warm day in a row", with the day's threshold in the why. Olympic Park has only about 9 years in that base period.
  - **Short dry spells.** Observatory Hill has about 29 runs of 3 or more dry days a year and 18 of 5 or more. A 2-day minimum put "the 2nd dry day in a row" in Today. Even at 5 days, about 16 dry spells a year score above 1.75, so Past week fills with ones like "the last of 5 dry days in a row, the longest dry spell since 24 June". A 7-day minimum or a weight might fix it. 0 mm needs no threshold, so dry spells work anywhere.
  - **Wet-day streaks** were tried and dropped. They mostly repeated the 3- and 7-day rain totals. At Olympic Park in February 2020, "the last of 5 days in a row with rain" took Past week's second slot for 10 February from "the wettest 3 days on record", because facts per day are counted by their last day.
  - **The station change.** 066214's minimums read about 0.3°C lower, which shortens runs of warm nights but would lengthen runs of cold nights since 2020. Settle T23 first.
