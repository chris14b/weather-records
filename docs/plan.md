# Build plan

The open tasks, in order of priority. Background and settled decisions are in [CLAUDE.md](../CLAUDE.md). How the pipeline reads data is in [pipeline.md](pipeline.md), and how it makes facts in [facts.md](facts.md).

## How to use this plan

- Each task has a permanent ID, such as `T15`. An ID is never reused or renumbered, and never has a letter after it (no `T5b`). A new task, including one split off another, takes the next ID, and goes where its priority puts it. Its place in the list, not its ID, sets its priority.
- **Next ID:** T39
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

## T26: Fact cards

**Status:** todo

**Goal:** Each fact as a card that can explain itself.

- Scope: an expandable "why" on each card, from the fact's `why`: the value, its rank, ties and days compared, the previous record holder, the since, missing days and gaps, and for a conditional fact the forecast. Values in `facts.json` have no units; `amount` in `src/site/naming.ts` adds them from the measure.
- Scope: a small chart of the why's `leaders` (the 10 best comparable days or periods), with the fact itself marked. Decide between hand-written SVG and a charting library, keeping the page light.
- Done when: tests cover the formatting, and the cards have been checked in the browser for a day fact, a period fact, a forecast fact and a conditional fact.

**Notes:**

- Each fact is an `li.fact` built by `factItem` in `src/site/render.ts`, and the big fact by `headline`. Open the why without pushing the panels around much, e.g. as a popover over the glass.
- A daylight fact (`kind: "daylight"`) has no `why`. Decide whether it needs one, e.g. its sunrise and sunset or the days around it, or no card at all.

---

## T27: Finishing the site

**Status:** todo

**Depends on:** T26

**Goal:** The site handles every location, state and screen well.

- Scope: default to the nearest location using browser geolocation. Coordinates are never sent anywhere, and a location the user chose wins and is remembered.
- Scope: a banner when the data is stale, from `generatedAt`. Runs are twice a day, so decide how old is too old.
- Scope: empty and error states: `facts.json` missing or malformed, a section with no facts, a quiet day with nothing in Today.
- Scope: dark mode, and accessibility, including the charts.
- Scope: a pass at phone widths. Desktop stays the main design, but the page must be easy to read and use on a phone.
- Done when: it has been checked in the browser at desktop and phone widths, in light and dark mode.

**Notes:**

- The page is already white text on dark glass over the sky, so decide what dark mode should change, if anything, beyond a darker sky.
- On a phone, the location toggle wraps onto two lines, and the headline's size is capped by the viewport width (`headline` in `src/site/render.ts`).
- Empty sections already show a line such as "Nothing notable in the forecast.", and an empty Today shows "Nothing notable yet today." If `facts.json` fails to load, the page shows one line of text.

---

## T32: Location in the URL

**Status:** todo

**Goal:** Each location has its own address, so a link opens the location it was copied from.

- Scope: the selected location goes in the URL, e.g. `?location=sydney-airport`, using the location's `id`. Choosing a location updates it with `history.replaceState`, so the back button doesn't step through every toggle.
- Scope: a URL with an unknown location falls back to the default. Paths must keep working under Vite's `base` (`/weather-records/`).
- Scope: if T27's remembered choice or geolocation lands first, the URL wins over both.
- Done when: tests cover reading and writing the parameter, and it has been checked in the browser, including reloading and an unknown location.

---

## T33: Today's forecast and the latest reading

**Status:** todo

**Goal:** Today shows BOM's forecast for the day, and the latest reading the run saw, clearly labelled with its time.

- Background: the user asked for the current temperature. The site can't show a truly current one: `facts.json` is written twice a day, there is no server, the browser can't reach BOM's FTP, and code must never fetch from BOM's website or app API. The honest version is the latest reading at the time of the run, such as "18.4°C at 10:30am", from IDN60920, which the pipeline already downloads. It goes stale within hours, so decide with the user whether it is worth showing, or only the forecast.
- Scope: add each day's minimum, maximum, chance of rain and rain range to the `forecast` field of each location in `facts.json`, which already gives each day's icon code and précis.
- Scope: show today's forecast in Today, near the headline, and decide whether the Coming week shows each day's forecast beside its facts.
- Scope: after 9pm the day's forecast is spent, so show tomorrow's, as `forecastStart` does.
- Done when: tests cover the new fields, and it has been checked in the browser for a morning and an evening `facts.json`.

---

## T38: Check the update runs' timings

**Status:** todo

**Goal:** Each scheduled run gets the data it is timed for.

- Scope: from the first scheduled runs' logs and commits, check that the evening run (11:30 UTC, first on 2026-11-09) had BOM's 11:00 UTC forecast and today's maximum, and that the morning run (23:30 UTC) had the 23:00 UTC forecast, last night's minimum and rain, and that morning's daily files. If the logs can't show it, have `build:data` print each feed's issue or observation time.
- Scope: check that an evening run handles the 11:00 UTC (10pm) forecast issue, whose day 0 is today with nothing left in it. No such issue had been seen by 2026-11-09. If the parser rejects it, every evening run fails.
- Scope: without daylight saving, from April 2027, the 9:30am run is 25 minutes after the 9am reading and the 9:30pm run 25 minutes after the 9pm reading. Check one of each then. If everything else is done before that, defer this part rather than holding the task open.
- Done when: the runs are shown to get their data, or the times or the pipeline are changed so they do.

**Notes:**

- The run times and their reasons are in CLAUDE.md. BOM's forecast schedule there comes from search results quoting its announcement (its site refuses automated requests), and matched the feed on 2026-11-09. The latest observations appeared about 5 minutes after the half-hour then.

---

## T34: When the next update is due

**Status:** todo

**Goal:** Beside "Updated…", the page says when the next update is due.

- Scope: work out the next run in the browser from the schedule in CLAUDE.md (10:30am and 10:30pm with daylight saving, 9:30am and 9:30pm without; the times are fixed in UTC). Keep the schedule in one place that the page and the workflow both use, or test that they match.
- Scope: GitHub often starts scheduled runs late, so say "next update due around 10:30pm", and once that time has passed without a new `facts.json`, say it is running late rather than giving a time in the past. Decide how this fits T27's stale-data banner.
- Done when: tests cover the next time either side of each run and across a daylight saving change, and it has been checked in the browser.

---

## T36: Live updates through the day

**Status:** todo

**Goal:** Today follows the day as it happens: the latest temperature, and facts such as "the hottest day since February" as soon as the running maximum gets there.

- Background, from 2026-11-09:
  - The browser can't fetch the data itself. BOM's feeds are FTP, which browsers can't open, and code must never fetch BOM's website or app API. So something must fetch the feeds for the page.
  - IDN60920 refreshes about every 30 minutes, so "live" means at best half-hourly. Its running maximum and the rain since 9am are already there.
  - This changes a settled decision in CLAUDE.md (twice-daily runs, no server, `facts.json` up to 12 hours old), so agree the approach with the user first.
- Options to put to the user:
  1. **A frequent static run**, Claude's suggestion: a second GitHub Actions workflow every 30 minutes that downloads only IDN60920 and IDN60910, rebuilds `facts.json` and deploys, without committing. The twice-daily runs still commit the data, so nothing is lost if the frequent ones fail. It stays free on a public repository and needs no server. But GitHub often starts scheduled runs 10 to 30 minutes late or skips them at busy times, so the page must show the reading's time.
  2. **A small server**, such as a scheduled serverless function (e.g. a Cloudflare Worker with a cron trigger) that fetches the feeds and writes the latest facts to storage the page reads. It is more reliable and timely than option 1, but it is a second system to deploy, monitor and secure, and the fact pipeline would have to run there too or be split.
- Scope, once chosen: a "latest reading" with its time in Today (which takes over T33's latest reading), Today's facts recomputed from the running maximum and the rain since 9am, and the weather sky still never claiming more than the data shows.
- Scope: decide how a fact during the day is worded, since the day isn't over: "Today is so far the hottest day since February".
- Done when: the approach is agreed, and the live site has updated through a day.

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

## T28: This year

**Status:** todo

**Goal:** A This year section with the standout months and seasons of the past 12 months, such as "February was the hottest February since 2012".

- Background: the pipeline already ranks complete months, seasons and years, and the current ones so far (the Periods section of [facts.md](facts.md)). It drops a complete period once it ended more than 31 days ago, and shows the rest in Past month under `calendarRule`.
- Scope: a `thisYear` section in `LocationFacts` for the complete months and seasons that ended in the last 12 months, and the year so far. Decide whether calendar periods leave Past month for it, or Past month keeps the latest complete month.
- Scope: selection rules of its own in `selection.ts`, within the Selection section of [facts.md](facts.md), so a strong month stays for the year but doesn't crowd the section.
- Scope: a This year panel on the page, after Past month, with its periods named as the site names the others.
- Done when: tests and the selection snapshots cover the section, and it has been checked in the browser.

---

## T18: README and retuning

**Status:** todo

**Goal:** Document the project, and tune the facts against real output.

- Scope: a README covering what the site is, how to refresh the ZIPs once a year (link to [refreshing-history.md](refreshing-history.md)), how to run the site locally, and the attribution.
- Scope: a pass over scoring, selection and wording once the scheduled runs have produced a couple of weeks of output. The constants are `sectionRules`, `calendarRule` and `conditionalRule` in `selection.ts`, and the weights in `scoring.ts`. Weak spots found so far:
  - Past week is often filled by short sinces such as "the coldest night since 20 October". These are true, but much alike from day to day.
  - Year-so-far ranks such as "the 9th wettest day of the year so far" or "the 7th biggest day-to-day drop in maximum temperature of the year so far" still get in at around 2.4.
  - Quiet days give Today nothing at all, as on 2026-10-30, whose only data is a minimum and rain.
  - Observatory Hill's year so far leaves out 9 to 16 years between 1864 and 1948, each with a month or so missing, so its records carry "(not counting 16 years with gaps)". That is still long for a headline. Allowing a missing month in a year so far might be fairer.
  - A period so far shows every day until the period ends, so it can sit in Past month for months.
  - The coming week's fallback (`forecastFloor`) can pick a conditional fact over a plainer forecast one, such as "A top of 18°C on Friday (forecast 20°C) would make it the coldest day since 3 November". Decide whether a fallback should prefer forecast facts.
- Done when: the README is written, and the retuning is reviewed with the user and the snapshot tests updated.

---

## T20: Backfill the 9am and 3pm readings

**Status:** todo

**Goal:** Give the 9am and 3pm facts about a year of history, from BOM's Daily Weather Observations (DWO), and make DWO the way to fill any gap that missed runs leave. The user wants this done after the site is live.

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

## T19: Wind

**Status:** deferred (the user shelved wind on 2026-10-30)

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
