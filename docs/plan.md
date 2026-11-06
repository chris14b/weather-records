# Build plan

The open tasks, in order of priority. Background and settled decisions are in [CLAUDE.md](../CLAUDE.md). How the pipeline reads data is in [pipeline.md](pipeline.md), and how it makes facts in [facts.md](facts.md).

## How to use this plan

- Each task has a permanent ID, such as `T15`. An ID is never reused or renumbered, and never has a letter after it (no `T5b`). A new task, including one split off another, takes the next ID, and goes where its priority puts it. Its place in the list, not its ID, sets its priority.
- **Next ID:** T28
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

## T24: Daily files that start in the month before

**Status:** todo

**Goal:** Read a current month's daily file that starts with the last days of the month before, so early-month runs don't fail.

- Background: on 2026-11-06, every location's `IDCKWCDEA0` file for November 2026 had 7 rows, 30 October to 5 November. Its title still says "for November 2026". The 30 and 31 October rows are identical to the same days in the October file. Complete months hold only their own days: September has 30 rows and October 31. The October file saved on 2026-10-30, with 29 days, started on 1 October. So the current month's file seems to show at least the last 7 days. That is a guess from one case; a file from the 6th or 7th of a month would confirm when the padding stops.
- `parseDailyFile` expects rows to run day by day from the 1st, so `updateDailyFiles` fails on every location until a month has 7 days. T15's build would fail in the first week of every month.
- Scope: skip leading rows from the previous month, only when they run on consecutive days and end on its last day, so the next row is the 1st. They needn't be kept, since the previous month's file has the same days, and the build reads that file too. Any other row from another month must still fail the build.
- Scope: the real Observatory Hill file from 2026-11-06 is saved as `test/fixtures/sydney_(observatory_hill)-202611.csv`. Test with it that the skipped rows are left out, that a file with only previous-month rows gives no days, and that a previous-month row anywhere else still fails.
- Scope: add the quirk to the FTP daily files section of [pipeline.md](pipeline.md).
- Done when: the tests pass, and `updateDailyFiles` runs on the real current month in the first week of a month without failing.

---

## T15: The `build:data` command

**Status:** todo

**Depends on:** T24

**Goal:** One command that runs the whole pipeline.

- Scope: `npm run build:data` (`src/pipeline/build-data.ts`, now a placeholder that throws) loads the history, fetches from FTP, saves the snapshot, layers the data, generates and scores the facts, and writes `facts.json` with a generated-at timestamp. For each location, the pieces fit together like this:
  - `loadLocationHistory` for rain, max and min. The history end is the earliest of the three last ZIP dates.
  - One FTP connection, wrapped in `withDownloadCache` so the current month downloads once. `updateDailyFiles` with `dir: "data/recent/daily"` and the history end, and `updateFtpHistory` with `dir: "data/ftp-history"`.
  - `downloadLiveFeeds(ftp)` once for all locations, then `updateSnapshot` with `snapshotDir: "data/recent/snapshots"`, `readingsDir: "data/recent/readings"` and `today` (today in Sydney, from `sydneyDate`).
  - `layerRecent` with the FTP daily files, then `snapshot.observations`, as its layers.
  - `locationSeries` with the layered rain, max and min, `updateFtpHistory`'s result and the snapshot's readings.
  - `forecast = { days: parseForecast(feeds.forecast, location.forecastArea).days, from: forecastStart(now) }`.
  - `generateCandidates({ locationId, series, windowEnd: today, offsets: stationOffsets(location), forecast })`, then `selectFacts({ locationId, facts, series, forecast })`, into one `LocationFacts` per location in the `FactsFile`.
- Scope: decide where `facts.json` goes. The site (T16) reads it, so Vite must serve it in development and copy it into the build, e.g. `src/site/public/facts.json`. It is committed with the data, so the deploy (T25) needs no data step. Record the choice in CLAUDE.md.
- Scope: failing loudly on any validation problem, and running a second time harmlessly.
- Done when: it runs end to end on this machine, its output is reviewed, and the data files and `facts.json` it writes are committed.

---

## T16: First page of the site

**Status:** todo

**Depends on:** T15

**Goal:** A static page that presents the facts for one location, designed for desktop first.

- Scope: a Vite site in `src/site/` that reads `facts.json`, using the types in `src/shared/facts.ts`. Keep dependencies few. If a framework is worth using, record the choice in CLAUDE.md's Stack section.
- Scope: a layout designed for a desktop browser. It must not break on a phone, but the phone pass is T27.
- Scope: a location picker for the three locations. The choice is remembered on the device. Defaulting to the nearest location is T27.
- Scope: a home page with four sections for the chosen location:
  - **Today:** the latest day's facts.
  - **This week:** a timeline of the past 6 days, e.g. "Last Tuesday: the hottest day since July".
  - **This month:** the standout facts from earlier in the month, and the calendar periods.
  - **Coming week:** the forecast and conditional facts (`comingWeek`). Decide where these go on the page. In the morning run, "if today reaches…" may belong in Today.
- Scope: names worked out in the browser from each fact's dates and the time of viewing, in Sydney time. A fact's `text` never names its own day (the Wording section of [facts.md](facts.md)), so the site puts "Today", "Last Tuesday" or "Tomorrow is" in front. Periods are named from `period`, `from` and `date`: "October", "The 3 days to Tuesday", "November so far".
- Scope: confirmed, provisional, forecast and conditional facts look different from each other, as well as reading differently.
- Scope: the note about the 2020 Observatory Hill station change, and the credit: © Bureau of Meteorology, licensed under CC BY 4.0.
- Done when: it runs locally with `npm run dev` against the real `facts.json`, and has been checked in the browser at desktop width.

---

## T25: Deploy to GitHub Pages

**Status:** todo

**Depends on:** T16

**Goal:** The site is live on GitHub Pages, deployed on every push to `main`.

- Scope: a workflow on push to `main` and a manual trigger. It installs, runs `npm test`, `npm run typecheck` and `npm run lint`, builds the site, and deploys it with `actions/upload-pages-artifact` and `actions/deploy-pages`. Pin each action's version.
- Scope: make the deploy reusable (e.g. `workflow_call`), so T17's scheduled runs can deploy too. A push made with the workflow's own `GITHUB_TOKEN` doesn't trigger other workflows, so T17 has to call it directly.
- Scope: Vite's `base` is `/weather-records/`, since this is a project site.
- Out of scope: fetching data. The workflow deploys the committed `facts.json`.
- Manual step for the user: in the repository's settings on GitHub, set Pages' source to **GitHub Actions**. Wait for the user to confirm this. Don't use `gh` to check runs; use the browser or `curl`.
- Done when: a push to `main` deploys, and `https://chris14b.github.io/weather-records/` shows the site with the committed facts.

---

## T26: Fact cards

**Status:** todo

**Depends on:** T16

**Goal:** Each fact as a card that can explain itself.

- Scope: an expandable "why" on each card, from the fact's `why`: the value, its rank, ties and days compared, the previous record holder, the since and `beatenBy` days, missing days and gaps, and for a conditional fact the forecast. Values in `facts.json` have no units, so the site adds them from the measure.
- Scope: a small chart of the why's `leaders` (the 10 best comparable days or periods), with the fact itself marked. Decide between hand-written SVG and a charting library, keeping the page light.
- Done when: tests cover the formatting, and the cards have been checked in the browser for a day fact, a period fact, a forecast fact and a conditional fact.

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

---

## T17: Scheduled updates

**Status:** todo

**Depends on:** T15, T25

**Goal:** The site updates itself every morning and evening.

- Scope: a workflow on the four schedules in CLAUDE.md (morning, evening and a backup for each) plus a manual trigger. It runs the tests and `build:data`, commits `data/recent/`, `data/ftp-history/` and `facts.json` when they change, and deploys with T25's workflow.
- Scope: two runs must never overlap (a `concurrency` group).
- Scope: check that FTP works from GitHub's servers.
- Scope: check the evening timing. Without daylight saving, the evening run is at 9:15pm, so it saves the maximum only if the 9pm observation is already published. If not, the 11:15pm backup should save it.
- Done when: a manual run deploys successfully, the live site shows the current facts, and a scheduled run has done the same.

---

## T12: Near-miss facts

**Status:** todo

**Goal:** Facts about observed days that fell just short of a notable rank, such as "yesterday came within 0.2°C of the hottest October day on record".

- Scope: for each observed day and comparison, find the nearest rank or "since" boundary above its value, and how far away it is, using the Ranking section of [facts.md](facts.md).
  - The function exists: `boundariesBetween` in `thresholds.ts` gives the earlier values between two values, nearest first, and `justBeyond` the value 0.1 past one. The nearest boundary above a day's value is `boundariesBetween(values, value, Infinity, direction)[0]`.
  - Decide what counts as near: a gap in the measure's own units, or a share of the spread of the comparison's values.
- Scope: scoring and wording within the existing ones (the Scoring, Selection and Wording sections of [facts.md](facts.md)), so a near miss never outscores a real fact for the same day, and isn't shown beside it for the same measure.
- Done when: tests pass for a near miss against a record, against a "since" year, and against a gap in the data, and the real data gives a near miss on a chosen day.

---

## T14: Sunrise and sunset facts

**Status:** todo

**Goal:** Facts about daylight, such as the latest sunset of the year or the day the days start getting longer.

- Scope: sunrise and sunset calculated from each station's latitude and longitude, with no API.
- Scope: facts for the latest sunset, the earliest sunrise, the longest and shortest day, and the point where days start getting longer or shorter. These come from the year's own curve, not from ranks against past years, so they need their own wording and scoring within the selection (the Selection section of [facts.md](facts.md)).
- Scope: show them on the site.
- Done when: tests pass, including a check of the calculation against published sunrise and sunset times for a few dates at each location.

---

## T18: README and retuning

**Status:** todo

**Depends on:** T17

**Goal:** Document the project, and tune the facts against real output.

- Scope: a README covering what the site is, how to refresh the ZIPs once a year (link to [refreshing-history.md](refreshing-history.md)), how to run the site locally, and the attribution.
- Scope: a pass over scoring, selection and wording once the scheduled runs have produced a couple of weeks of output. The constants are `sectionRules`, `calendarRule` and `conditionalRule` in `selection.ts`, and the weights in `scoring.ts`. Weak spots found so far:
  - This week is often filled by short sinces such as "the coldest night since 20 October". These are true, but much alike from day to day.
  - Year-so-far ranks such as "the 9th wettest day of the year so far" or "the 7th biggest day-to-day drop in maximum temperature of the year so far" still get in at around 2.4.
  - Quiet days give Today nothing at all, as on 2026-10-30, whose only data is a minimum and rain.
  - Observatory Hill's year so far has 10 incomplete years in the 1800s, so its records carry "(with 10 years too incomplete to compare)", which is long for a headline.
  - A period so far shows every day until the period ends, so it can sit in This month for months.
- Done when: the README is written, and the retuning is reviewed with the user and the snapshot tests updated.

---

## T20: Backfill the 9am and 3pm readings

**Status:** todo

**Depends on:** T25

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

**Depends on:** T25

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
  - **Short dry spells.** Observatory Hill has about 29 runs of 3 or more dry days a year and 18 of 5 or more. A 2-day minimum put "the 2nd dry day in a row" in Today. Even at 5 days, about 16 dry spells a year score above 1.75, so This week fills with ones like "the last of 5 dry days in a row, the longest dry spell since 24 June". A 7-day minimum or a weight might fix it. 0 mm needs no threshold, so dry spells work anywhere.
  - **Wet-day streaks** were tried and dropped. They mostly repeated the 3- and 7-day rain totals. At Olympic Park in February 2020, "the last of 5 days in a row with rain" took This week's second slot for 10 February from "the wettest 3 days on record", because facts per day are counted by their last day.
  - **The station change.** 066214's minimums read about 0.3°C lower, which shortens runs of warm nights but would lengthen runs of cold nights since 2020. Settle T23 first.
