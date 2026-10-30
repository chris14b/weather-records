# Build plan

One task per session, in order. Background and settled decisions are in [CLAUDE.md](../CLAUDE.md).

Statuses: `todo`, `in progress`, `done`, `blocked`, `deferred` (skip until the user says otherwise). At the end of each session, update the task's status and add notes for later sessions under **Notes**.

---

## 1. Git repository

**Status:** done

**Goal:** Put the project under git on the personal GitHub account `chris14b`, so every later task has commit history.

- Manual step for the user, done first: while signed in to GitHub as `chris14b`, create an empty **public** repository named `weather-records`, with no README, licence or `.gitignore`. It must be public for GitHub Pages and free Actions minutes. Wait for the user to confirm this before pushing.
- Scope: `git init` with the branch `main`, and set this repository's own config to match the sibling `gallery` project:
  - `user.name` = `chris14b`
  - `user.email` = `chris14b@gmail.com`
  - `core.sshCommand` = `ssh -i ~/.ssh/id_ed25519_personal -o IdentitiesOnly=yes`
  - `origin` = `https://github.com/chris14b/weather-records.git` (the global git config already rewrites this to SSH)

  This machine's global git identity and the GitHub CLI belong to the work account (`chrisjohnstonsc`), so don't use `gh` here, and don't change any global config.

- Scope: a minimal `.gitignore` (`.DS_Store`, `node_modules/`, `dist/`, `.idea/`, `.env*`). Task 2 adds to it.
- Scope: commit what exists (`CLAUDE.md`, `docs/`, and the ZIPs in `data/raw/`, which the build on GitHub needs), then push and set the upstream. Ask the user before committing and pushing.
- Done when: `git log` shows the commit with `chris14b` as the author, and the repository on GitHub has the files.

**Notes:**

- The user created `chris14b/weather-records` by hand on GitHub. It is public, and was empty, so the first commit is the root of `main` (no force-push).
- Public status can be checked without `gh`: `curl https://api.github.com/repos/chris14b/weather-records` returns 404 for a private repo.
- Pushes go over SSH with the personal key: the global `url.ssh://git@github.com/.insteadof https://github.com/` rewrite plus this repo's `core.sshCommand`. `git ls-remote origin` is a quick way to confirm access.

---

## 2. Project setup

**Status:** done

**Goal:** An empty TypeScript project that installs, type-checks, lints and runs tests.

- Scope: `package.json` with scripts (`test`, `typecheck`, `lint`, `format`, `build:data`, `dev`, `build:site`), strict `tsconfig`, Vitest, ESLint and Prettier, `.gitignore` and `.nvmrc`.
- Scope: folder layout: `src/pipeline/` (data and facts), `src/site/` (website), `src/shared/` (types used by both), `data/raw/` (ZIPs, already present), `data/recent/` (saved FTP and snapshot data), `test/fixtures/`.
- Out of scope: any real code.
- Done when: `npm test`, `npm run typecheck` and `npm run lint` all pass, with one placeholder test.

**Notes:**

- Node 26 became the LTS on 2026-10-28, so `.nvmrc` says `26`. It is installed with nvm, but this machine's nvm default is still 22, so run `nvm use` in each shell first.
- TypeScript is pinned to `~6.0` because `typescript-eslint` 8.72 supports only `<6.1`. Move to TypeScript 7 once it does.
- Node runs the pipeline's `.ts` files directly through type stripping, with no build step. So `erasableSyntaxOnly` is on (no enums, namespaces or parameter properties), and relative imports use the `.ts` extension.
- Type-checking uses two projects under `tsconfig.json`: `tsconfig.node.json` (pipeline, shared, tests and config files, Node types, no DOM) and `tsconfig.site.json` (site and shared, DOM, no Node types). Shared code must therefore stay free of both Node and DOM APIs.
- ESLint uses `typescript-eslint`'s `strictTypeChecked` and `stylisticTypeChecked`. Its config is `eslint.config.js`, not `.ts`, because a TypeScript config needs `jiti` or an unstable flag.
- Vite's root is `src/site`, and it builds to `dist/`. Vitest has its own `vitest.config.ts` so that it doesn't inherit that root. Tests can live in `test/` or next to the code as `*.test.ts`.
- `build:data` runs `src/pipeline/build-data.ts`, which only throws "not implemented" until task 11. `src/site/main.ts` is a placeholder.
- `npm run format:check` checks formatting without writing. Running Prettier reformatted the Locations table in CLAUDE.md, with no change to its content.

---

## 3. History loader

**Status:** done

**Goal:** Read the Climate Data Online ZIPs in `data/raw/` into typed daily records.

- Scope: find ZIPs by product code and station number, then read the CSV inside without unzipping to disk.
- Scope: parse each day as date, measure, value, period in days, and quality. Keep multi-day totals and quality flags rather than dropping them.
- Scope: validation that throws a clear error for a missing file, the wrong station or product, or changed headers.
- Out of scope: joining stations, FTP data.
- Done when: tests pass against small fixture ZIPs that cover every validation error, and loading the real files returns the known records: 45.8°C at 066062 on 2013-01-18, and 327.6 mm at 066062 on 1986-08-06.

**Notes:**

- `loadHistory(rawDir, station, measure)` in `src/pipeline/history.ts` returns one station's records for `rain`, `maxTemp` or `minTemp`, in date order. ZIPs are found by the `<product>_<station>_` prefix, so the `_1800` suffix isn't assumed. Two matching ZIPs is an error too. The ZIPs are read in memory with `fflate`, the only runtime dependency.
- Rows with a blank value are left out, so a missing day simply has no record. Some real rows have a blank value with period 1; these count as missing too.
- `periodDays` is `null` where the file leaves it blank. That covers most Observatory Hill rain before about 1970 and a few hundred Airport rows. These are probably single days, but the loader doesn't guess, so task 7 must decide. Sydney Airport rain has one row with period `0` (1994-07-04, 0.0 mm), kept as 0. Together with its 16 multi-day totals, that makes the 17 that CLAUDE.md mentions. Observatory Hill also has one 2-day max and one 2-day min (1996-06-30).
- `quality` is `null` where the file leaves it blank, which happens on a handful of rows.
- Validation also rejects rows that aren't in strictly increasing date order, rows without 8 columns, and badly formed values, periods or quality flags. Every error names the ZIP and the line.
- The fixture ZIPs are built in a temp directory by the tests from inline CSV text, rather than committed as binary files, so each case can be read in the test. The real-file tests read `data/raw/` directly. The placeholder test was removed.
- The ZIPs end on 2026-10-30 (rain and min) and 2026-10-29 (max) for the open stations. Observatory Hill 066062 ends on 2020-08-31, except its max, which ends on 2020-08-30.

---

## 4. Locations config and station joining

**Status:** done

**Goal:** Turn the station histories into one daily series per location.

- Scope: a config listing each location, its stations with their cutover dates, its forecast area, and its latitude and longitude. The values are in CLAUDE.md.
- Scope: join by cutover date only. Each value records which station it came from.
- Out of scope: FTP data and layering by source.
- Done when: tests cover the Observatory Hill cutover (2020-08-31 comes from 066062, 2020-09-01 from 066214) and confirm that gaps are not filled across stations.

**Notes:**

- The config is `locations` in `src/shared/locations.ts`, in `src/shared/` because the site will need the names and coordinates too. Each location's `stations` lists its stations in order; every station after the first has a `from` date, and supplies values from then until the next station's `from`. Location ids are `sydney-observatory-hill`, `sydney-airport` and `sydney-olympic-park`. Names are the current station's `description` in the observations feed (IDN60920), and each `forecastArea` holds the AAC code and description from the forecast feed (IDN11060), so everything matches what BOM itself calls them.
- The coordinates are the current station's, to four decimal places, from the observations feed. The station notes in the ZIPs give only two.
- `loadLocationHistory(rawDir, location, measure)` in `src/pipeline/stations.ts` loads and joins a location's history. The join itself, `joinStations`, is generic over any record with a `date`, so task 5 can reuse it for FTP data if the folders need splitting by station. Each joined record gains a `station` field. It throws on a bad config: a first station with a `from`, a later one without, a malformed date, or dates out of order.
- The real data has a gap-filling trap at the cutover: 066062 has no max for 2020-08-31, but 066214 does (22.6). The joined Sydney max series therefore has no 2020-08-31, and a test checks this. 066214's records from before 2020-09-01 (it opened in 2017) are dropped.
- `isValidDate` moved from `history.ts` into `src/pipeline/dates.ts` so both modules can use it.

---

## 5. FTP daily files and layering

**Status:** done

**Goal:** Keep `data/recent/` up to date from the FTP daily files, and layer that data over the history.

- Scope: an FTP client (e.g. `basic-ftp`) with timeouts and retries.
- Scope: a parser for the monthly `IDCKWCDEA0` CSVs (blank cells mean missing).
- Scope: a save format in `data/recent/` that is readable in a diff, such as one CSV per station.
- Scope: layering by priority (ZIP, then FTP daily, then snapshot), recording the source of each value.
- Scope: pruning saved copies for dates the ZIPs cover, and the gap check between the ZIP history and the recent data.
- Out of scope: live observations, forecast.
- Done when: tests with fixture files cover parsing, priority, pruning and the gap error, and a manual smoke script fetches the real current month for one station.

**Notes:**

- Modules in `src/pipeline/`: `ftp.ts` (`connectToBom()`, anonymous `basic-ftp` with a 30 s timeout and 3 attempts, reconnecting between them; a 550 reply returns `undefined` rather than retrying), `daily-files.ts` (path and parser), `recent.ts` (saved copies and `updateDailyFiles`) and `layering.ts` (`layerRecent`). `basic-ftp` is the second runtime dependency.
- Each station in `src/shared/locations.ts` now has its official `name` (its `stn-name` in IDN60920, which its ZIP notes and BOM's FTP index `IDCKWCDEA0/tables/stations_db.txt` also use) and its FTP `dailyFolder`, copied exactly from BOM's folder listing. The folder is on the station, not the location, because the files are per station. The Observatory Hill folder held 066062's values before 2020 (January 2010 matches its ZIP), so both its stations have it. The FTP server has no list linking folders to station numbers: `stations_db.txt` has 109 NSW stations, but there are 132 NSW folders. There is also a second Olympic Park folder, `sydney_olympic_park_(sydney_olympic_pk_a)`, for an older station whose last file is 2011-08.
- The real files differ from what the plan assumed. They are Latin-1, not UTF-8 (the `°C` header). The first line says `'IDCKWCDE51`, and the third says "South Australia" even for NSW. Blank cells hold a single space. Each row names the station, but there is no station number. The name is the official one with " AWS" left out (`SYDNEY OLYMPIC PARK (ARCHERY CENTRE)` for 066212). That rule holds for 512 of the 517 stations in `stations_db.txt`; the 5 exceptions involve punctuation such as `M.O.`. So the parser expects the official name minus " AWS" in the title line and in each row, and it checks the four column header lines exactly. Rows must run day by day from the 1st, and the file must end with its `Totals:` line, so a truncated or gappy file fails loudly. The current month's file holds the days published so far; a future month's file doesn't exist (550).
- The dates follow the ZIP conventions exactly: for October 2026 at 066214, every value present in both agrees on the same date. The FTP files have gaps that the ZIPs later fill (066214 rain on 2026-10-15).
- FTP rain is always a single day, so `layerRecent` gives FTP values `periodDays: 1` and `quality: null`. Where Sydney Airport's ZIP has a multi-day total (3 days to 2026-03-20, 22.2 mm), the FTP file has three separate daily values that sum to 21.4 mm. They seem to come from the automatic gauge, not the manual one behind the official figures. So they can differ a little from the ZIP, which wins once it covers the date.
- Saved copies are `<dir>/<station>.csv` with columns `date,rain,maxTemp,minTemp`, one row per day the FTP file covers (blank cells for missing values, so an all-blank row still records that the day was covered). Task 11 should pass `dir` as `data/recent/daily`; task 6 can put snapshots beside it (for example `data/recent/snapshots/`). `updateDailyFiles` fetches each station's own folder for the months its period overlaps the range to fetch, then assigns the rows by the location's cutover dates through `joinStations`.
- `updateDailyFiles` takes `historyEnd`: the earliest of the location's three last ZIP dates (from `loadLocationHistory`). It fetches every month from the one holding the first day after the later of `historyEnd` and the last saved day, up to the current Sydney month (`sydneyDate` in `dates.ts`). The fetched months replace their saved rows, and rows up to `historyEnd` are pruned, deleting a file when it empties. A missing current-month file is skipped; any earlier missing month is an error. Running it twice gives the same files.
- Layering, per measure: the ZIP history alone covers every date up to its own last record, so a day missing from it stays missing even if the FTP file has a value. After that, each day takes the first layer (in the order given, so FTP then snapshot) that has a value, so a snapshot can fill a day the FTP file leaves blank. Each record carries `source` (`zip`, `ftp` or `snapshot`) and `station`. The gap check fails when the first recent date after the history's end isn't the next day. Recent days with all-blank values still count as coverage.
- The ZIPs were downloaded today, so they currently run a day or two ahead of the FTP files and `data/recent/daily/` will stay empty until they age. An end-to-end run against the real data, with the histories cut at 2026-07-20, layered about 98 FTP days onto each series with no gap errors.
- `npm run smoke:daily-files [location-id]` fetches and prints the current month for one location (Observatory Hill by default). The real October file for Observatory Hill is committed in `test/fixtures/` for the parser tests; `test/daily-file.ts` builds made-up files in the same format.

---

## 6. Live observations and forecast

**Status:** done (reopened 2026-10-30 for the follow-up below, before the first pass was committed, and finished the same day)

**Follow-up:** save **every useful field** from the 9am and 3pm readings, not just temperature and humidity.

- The fields: `air_temp`, `rel_hum`, `dewpt`, `press_msl`, `cloud_oktas`, `wind_dir`, `wind_spd_kmh` and `gust_kmh`.
- These readings' history only starts when saving starts, so saving them now keeps later facts (e.g. "the lowest 9am pressure since…") possible, even though no facts use them yet.
- Some stations don't report some fields: Olympic Park has no pressure, and only Sydney Airport has cloud. A field that's null in the feed is saved as blank.
- Keep the same rules: exact 09:00 and 15:00 only, and never pruned.
- Widen the saved format to one column per field and time (e.g. `dewPoint9am`, `pressure3pm`). The first pass was never committed, so there's no saved data to migrate.

**Goal:** Capture the live snapshots and the 7-day forecast for each location.

- Scope: a parser for `IDN60920.xml`. Save today's provisional max, last night's min and rain to 9am for each station into `data/recent/`.
  - The pipeline runs in the morning as well as the evening (see CLAUDE.md).
  - Save the min and the rain only once their windows have closed at 9am.
  - Save the max only once its 6am–9pm window has closed, so a morning run never saves a partial maximum or overwrites a complete one.
- Scope: the **9am and 3pm readings** from `IDN60910.tgz`.
  - Extract each station's `IDN60910.<wmo>.json` in memory, and add each station's WMO number to the config.
  - Save the temperature and relative humidity from the exact 09:00 and 15:00 readings into a file per station in `data/recent/` (e.g. `data/recent/readings/`). A missing reading stays missing; never use a nearby time instead.
  - The file covers 72 hours, so each run saves every 9am and 3pm reading in it. Two missed nights lose nothing.
  - These files are never pruned, because no ZIP has these readings.
- Scope: a parser for `IDN11060.xml`, giving the forecast for each location by its forecast area's AAC code (`forecastArea.aac`), checking that the description still matches: daily max and min, chance of rain, and the rain amounts with 50% and 25% chances.
- Out of scope: turning any of this into facts.
- Done when: tests against saved fixture XML pass, and running a snapshot twice produces the same result.

**Notes:**

- New modules in `src/pipeline/`: `observations.ts` (IDN60920), `readings.ts` (IDN60910), `forecast.ts` (IDN11060), `snapshots.ts` (`downloadLiveFeeds` and `updateSnapshot`), `xml.ts` (a thin typed layer over `fast-xml-parser`) and `errors.ts` (`inContext`, which prefixes errors with the file and element). New runtime dependencies: `fast-xml-parser`, `fast-xml-validator` (the parser's own validator is deprecated, and without it a truncated file could parse quietly) and `nanotar` (reads the tar in memory; `fflate` already gunzips).
- The CSV reading and writing from task 5 moved into `saved-table.ts` (`readSavedRows`, `writeSavedRows`, `mergeRows`), which all three kinds of saved file share. Each file is described by a schema of its columns in order, each `number` or `text` (e.g. `dailySchema` in `recent.ts`). Text cells can't hold commas, quotes or line breaks; writing one fails. `mergeRows` merges cell by cell: a fresh value replaces a saved one, and a missing fresh value leaves it alone. Task 6b can reuse all of this for `data/ftp-history/`.
- Each station has an optional `wmo`, set only for the three current stations; 066062's isn't needed or confirmed. `currentStation(location)` in `locations.ts` is a location's last station, the only one in the live feeds.
- `downloadLiveFeeds(ftp)` downloads all three feeds once, since each covers all of NSW. Task 11 should then call `updateSnapshot` per location with `snapshotDir: "data/recent/snapshots"` and `readingsDir: "data/recent/readings"`, and pass `snapshot.observations` to `layerRecent` as the `snapshot` layer. The forecast isn't saved: task 10 calls `parseForecast(feeds.forecast, location.forecastArea)`.
- Observations: the station is found by `bom-id`, and its `stn-name`, `description` and `wmo-id` are checked. `rainfall_24hr` must run 9am to 9am, `minimum_air_temperature` 6pm to 9am and `maximum_air_temperature` 6am to 9pm, or the build fails. A value is used only once its window's `end-time-utc` is at or before the observation's time; rain and min are credited to the day the window ends, max to the day it starts. This relies only on each element's own times, so it doesn't matter when BOM rolls the windows over (not observed). The snapshot min covers 6pm–9am, not the official 9am–9am, so like the max it is provisional.
- Snapshot files use the same `date,rain,maxTemp,minTemp` format as the daily files, and are pruned up to `historyEnd` the same way. A morning run never touches the max, because its window is still open, so it can't overwrite the evening's.
- Timing to watch in task 13: without daylight saving, the evening run is at 9:15pm, so it saves the max only if the 9pm observation is already published. If not, the 11:15pm backup saves it.
- Readings: the JSON has no station number, only `wmo` and `name` (the location's name), and both are checked on the header and on every row. It holds 144 half-hourly rows (72 hours, oldest at 3pm three days back) plus special observations at odd minutes, which are ignored. Only rows at exactly `090000` or `150000` local are used. Two identical rows at the same time are fine; two different ones fail. Never pruned.
- Readings fields (the follow-up): `air_temp`, `rel_hum`, `dewpt`, `press_msl`, `cloud_oktas`, `wind_dir`, `wind_spd_kmh` and `gust_kmh` are saved as `temp`, `relHum`, `dewPoint`, `pressure`, `cloud`, `windDir`, `windSpeed` and `gust`, each with a `9am` or `3pm` suffix: all eight 9am columns, then all eight 3pm ones (`readingSchema` in `readings.ts`). Every field must be present in every row, as a number or null; a missing key fails the build. `wind_dir` is the only text column: one of the 16 compass points or `CALM`, with BOM's `-` saved as blank and anything else failing. On 2026-10-30, Observatory Hill had no cloud or gust, Olympic Park no pressure or cloud, and Sydney Airport every field.
- Forecast: each `forecast-period` is one local day, checked to be consecutive and to end at midnight. Temperatures must be whole numbers, the chance must look like `80%`, and the rain range like `0 to 8 mm`; any other format fails the build. Day 0 has no minimum. Days with a low chance often have no `precipitation_range` at all, so `rain50` and `rain25` are null; task 10 must decide whether that means 0 mm.
- Fixtures are real feeds from 2:30pm on 2026-10-30: `IDN60920.xml` and `IDN11060.xml` trimmed to the Sydney stations and areas (plus Canberra), and the whole `IDN60910.94768.json`. Tests build the `.tgz` around them, and edit the text to cover other times and failures. `test/fixtures/` is now in `.prettierignore` so the real files stay byte for byte.
- `npm run smoke:live` downloads the three feeds and prints what each location would save and its forecast, without saving anything.

---

## 6b. Humidity and solar radiation

**Status:** done

**Goal:** Daily humidity and solar radiation for every location, with history back to 2009, so task 7 can make facts like "the most humid day since 2019" or "the gloomiest November day since 2015".

- Background, checked on 2026-10-30:
  - The FTP daily files that task 5 reads also have each day's highest and lowest relative humidity (%) and its solar radiation (MJ/m², the day's total sunshine energy; low means cloudy).
  - The columns are filled every day for all three stations in January 2010 and October 2026 alike.
  - The Observatory Hill and Sydney Airport folders start in 2009-01. The Olympic Park (Archery Centre) folder starts when that station opened in 2011.
  - The ZIPs have none of these measures.
- Scope: read the three columns in the daily file parser as `maxRelHum`, `minRelHum` and `solar`. Blank cells mean missing, as for the others.
- Scope: a one-off backfill from every monthly file since each station's folder begins (about 600 small files in all). Assign rows to stations by the location's cutover dates, as `updateDailyFiles` does.
  - Save to a committed file per station, e.g. `data/ftp-history/<station>.csv` with `date,maxRelHum,minRelHum,solar`.
  - These files are never pruned, because no ZIP replaces them.
  - The backfill must be resumable, and running it twice must give the same files.
- Scope: keep these files up to date on every run, from the monthly files the pipeline already downloads. Fetch any month after the last saved day, so a long outage can't leave a gap.
- Scope: update the data sources section of CLAUDE.md.
- Out of scope: wind (task 15, deferred), evapotranspiration and pan evaporation.
- Done when: tests cover the parser columns, backfill and resuming, and the backfill has been run for real and committed.

**Notes:**

- The IDCJAC0016 solar ZIP check was split out into task 17 at the user's request on 2026-10-30, so solar comes from the FTP files only for now.
- `parseDailyFile` now returns `DailyFileDay`: the task 5 fields plus `maxRelHum`, `minRelHum` (%) and `solar` (MJ/m²). `updateDailyFiles` still saves only rain, max and min. `downloadDailyFile` (a missing file is an error unless it's the current month's) and `folderMonths` in `daily-files.ts` are shared by both updaters.
- `updateFtpHistory` in `src/pipeline/ftp-history.ts` does both the backfill and the update on each run. For each station, it fetches from the month of the day after its last saved day (or from its folder's first month) up to the current month, within the station's own period. It writes the file after every month, so an interrupted run resumes where it stopped. Fetched months replace their saved rows, as in task 5, and nothing is pruned. Every day a file covers gets a row, even an all-blank one.
- Task 11 should call `updateFtpHistory({ dir: "data/ftp-history", … })` for each location on every run, and wrap the connection in `withDownloadCache` (in `ftp.ts`) so that it and `updateDailyFiles` download the current month only once.
- `npm run backfill:ftp-history` runs the same function for every location. It was run on 2026-10-30: 586 monthly files, ending on 2026-10-28. A second run fetched only October for the three open stations and left the files byte for byte the same.
- Each station's `dailyFolder` is now an object: its `name`, the month of its first file (`from`) and the months it has no file for (`missing`). The two Observatory Hill stations share one. The folders start in 2009-01 (Observatory Hill, Sydney Airport) and 2011-08 (Olympic Park, whose August 2011 rows are all blank; its first values are on 2011-09-01).
- **Observatory Hill has a gap:** its folder has no files from 2018-04 to 2020-07, and none of the other Sydney folders cover it (`sydney_harbour_(wedding_cake_west)` stops at 2018-03 too). So Observatory Hill has no humidity or solar from 2018-04-01 to 2020-07-31: 066062's file covers 2009-01 to 2018-03 and 2020-08, and 066214's starts on 2020-09-01. Task 7 must not let a "since YYYY" or rank for these measures reach back across the gap without saying so, because the missing years might have held a higher value.
- The format hasn't changed since 2009: the parser read all 586 files with no changes. Blank values are rare (at most 44 per station for solar). Every humidity value is 0–100 with the minimum never above the maximum, and solar is always below 40.
- Saved numbers are written as JavaScript prints them, so BOM's `32.70` is saved as `32.7`.
- `FakeFtp` in `test/daily-file.ts` is now shared by the FTP tests, and `dailyFile` takes any subset of the measures, leaving the rest blank.

---

## 7. Fact generator: daily facts

**Status:** todo

**Goal:** Generate candidate facts for single days.

- Scope: measures are daily max, daily min, rain, hottest night (highest min), coldest day (lowest max) and daily range. Also:
  - Daily highest and lowest humidity and solar radiation from task 6b ("the most humid day", "the sunniest day", "the gloomiest day"). Their history starts in 2009 (2011 at Olympic Park), so "all records" means "since 2009". Observatory Hill has none from 2018-04 to 2020-07 (see task 6b's notes). Task 17 may later extend the solar history.
  - 9am and 3pm temperature and humidity, whose records only start when task 6's saving began. So for those, "all records" means "since saving began".
  - For all of these, the wording must not claim "on record" unless the history really goes back to when records began.
- Scope: comparisons against all records, this year, the same month in every year, and the same calendar date. Both highest and lowest.
- Scope: a **rank** among the comparable days (1st, 2nd, 3rd…), with tied values sharing a rank, plus how many days were compared. This makes "the 2nd coldest" or "the 8th wettest" possible, not just "the coldest".
- Scope: "since YYYY" logic: the most recent day that matched or beat the value.
- Scope: facts for **every day in the last 31 days**, not just the latest, so the home page can show the past week and month. Each day is compared only with data up to and including that day, as things stood then. If a later day in the window has since beaten it, record which day.
- Scope: rules for missing data and multi-day totals, and a confirmed or provisional status on each fact.
- Scope: the types for `facts.json` in `src/shared/`.
- Out of scope: scoring, wording, periods longer than a day.
- Done when:
  - tests on small made-up series pass, including ties, and a day whose rank ignores later days
  - the real data produces "hottest day on record" for Sydney on 2013-01-18

**Notes:**

---

## 8. Scoring, selection and wording

**Status:** todo

**Goal:** Choose the few facts worth showing, and word them well.

- Scope: an unusualness score based on the rank compared with how many days were compared, how many years back the "since" goes, how narrow the comparison is, and how long the record is.
  - "The 2nd hottest day on record" must outscore "the 8th hottest day this month".
  - Ranks below about 10th aren't worth showing.
- Scope: removing near-duplicates, for example keeping only the strongest of "hottest this month" and "hottest this year" for the same day.
- Scope: choosing facts for each section of the home page, for each location:
  - **Today:** the latest day.
  - **This week:** the best one or two facts for each of the previous 6 days.
  - **This month:** only strong facts from 7–31 days ago.
- Scope: `facts.json` grouped by those sections.
- Scope: English wording templates with dates and ordinals.
  - Rank 1 is "the hottest", then "the 2nd hottest", and tied values give "the equal 3rd hottest".
  - A fact that a later day beat says so, e.g. "the hottest day of the year so far, until Friday".
- Scope: a "why" payload for each fact: the value, the previous record holder, and the values it was compared against.
- Done when: snapshot tests pass for the selected facts on a few chosen real dates, and a short written review of their output is added to the notes.

**Notes:**

---

## 9. Facts for longer periods and streaks

**Status:** todo

**Goal:** Facts for weeks, months, seasons and years, plus streaks.

- Scope: rolling 7-day rain, months (full and to date), seasons, year to date, and calendar years.
- Scope: ranks for periods as well as days, e.g. "the 3rd wettest October on record".
- Scope: facts about the last full week and the last full month for the home page's week and month sections, using the same scoring and selection as task 8.
- Scope: phrasing for periods still in progress, such as "hottest start to October on record".
- Scope: streaks, such as consecutive hot days or dry spells, which must not run through gaps.
- Done when: tests pass for each period type and for streaks that meet a gap.

**Notes:**

---

## 10. Forecast, near-miss and sunrise/sunset facts

**Status:** todo

**Goal:** Facts about the coming week and about daylight.

- Scope: forecast highs and lows compared with the records ("tomorrow is forecast to be the hottest November day since…"), and the wettest-7-days forecast using the 50% rain amounts.
- Scope: **what it would take** for a forecast day, e.g. "if tomorrow reaches 47°C, it will be the hottest day since 2013". The morning run includes today as one of these days ("if today reaches…"); the evening run starts from tomorrow.
  - For each comparison, find the value needed to reach the next notable rank or "since" year above the forecast.
  - Only offer values within reach: up to about 2°C beyond the forecast temperature, and for rain up to the forecast's 25%-chance amount.
- Scope: **near misses** for observed days, e.g. "yesterday came within 0.2°C of the hottest October day on record".
- Scope: scoring and wording for both kinds, within task 8's selection.
- Scope: sunrise and sunset calculations, giving latest sunset, earliest sunrise, longest and shortest day, and the point where days start getting longer or shorter.
- Done when: tests pass, including a check of the sunrise and sunset calculation against published times for a few dates.

**Notes:**

---

## 11. The `build:data` command

**Status:** todo

**Goal:** One command that runs the whole pipeline.

- Scope: `npm run build:data` loads the history, fetches from FTP, saves the snapshot, layers the data, generates and scores the facts, and writes `facts.json` with a generated-at timestamp.
- Scope: failing loudly on any validation problem, and running a second time harmlessly.
- Done when: it runs end to end on this machine, and its output is reviewed.

**Notes:**

---

## 12. Website

**Status:** todo

**Goal:** A static site that presents the facts.

- Scope: a Vite site that reads `facts.json`.
- Scope: a location picker that defaults to the nearest location using browser geolocation, with a manual toggle. The choice is remembered on the device, and coordinates are never sent anywhere.
- Scope: a home page with three sections for the chosen location:
  - **Today:** the latest day's facts and the forecast facts.
  - **This week:** a timeline of the past 6 days, e.g. "Last Tuesday: the hottest day since July".
  - **This month:** the standout facts from earlier in the month.
- Scope: day names ("today", "yesterday", "last Tuesday") worked out in the browser from each fact's date and the time of viewing.
- Scope: fact cards with an expandable "why" and a small chart.
- Scope: a banner when the data is stale, the note about the Observatory Hill station change, and the BOM credit.
- Scope: mobile first, with dark mode and accessibility.
- Done when: it runs locally against a real `facts.json`, and has been checked in the browser at phone and desktop widths.

**Notes:**

---

## 13. GitHub Actions and Pages

**Status:** todo

**Goal:** The site updates itself every morning and evening.

- Scope: a workflow on the four schedules in CLAUDE.md (morning, evening and a backup for each) plus a manual trigger. It runs the tests and `build:data`, commits `data/recent/` and `facts.json` when they change, and builds and deploys to Pages.
- Scope: check that FTP works from GitHub's servers.
- Manual step for the user: enable Pages for the repository, with GitHub Actions as the source. List this in the notes.
- Done when: a manual run deploys successfully and the live site shows the current facts.

**Notes:**

---

## 14. Polish and documentation

**Status:** todo

**Goal:** Tidy up the rough edges.

- Scope: a README covering what the site is, how to refresh the ZIPs once a year (link to [refreshing-history.md](refreshing-history.md)), how to run the site locally, and the attribution.
- Scope: empty and error states on the site.
- Scope: a last pass over wording and scoring, based on a couple of weeks of real output.

**Notes:**

---

## 15. Wind

**Status:** deferred (the user shelved wind on 2026-10-30)

**Goal:** Wind facts such as "the 8th windiest day this year", for the locations where BOM's feeds allow them.

- Background, checked on 2026-10-30:
  - The FTP daily files have a column for the day's average 10 m wind speed (m/s). It holds real values for Sydney Airport (files from 2009) and Sydney Olympic Park (from 2011).
  - Observatory Hill reports `0.00` every day because it has no wind instrument: BOM measures Sydney's harbour wind at Fort Denison instead. Treat those zeros as missing, never as calm, so there are no wind facts for Observatory Hill.
  - The ZIPs don't include wind, and no allowed source has a history of gusts.
- Scope: a one-off backfill of the wind column from every FTP daily file since each station's first file, saved in a committed file per station (e.g. `data/wind/<station>.csv`). Keep it up to date from the files the daily run already downloads. It is never pruned, because no ZIP replaces it.
- Scope: wind measures for the fact generator, with every comparison that has enough history. Rankings and wording ("windiest", "calmest") come from tasks 7–9.
- Scope: update the data sources section of CLAUDE.md.
- Out of scope, so ask the user first: saving each day's maximum gust from the live feed. Its records would only begin on the day saving starts.
- Done when: tests cover the parsing, the backfill, and the rule that Observatory Hill's zeros count as missing.

**Notes:**

---

## 16. Backfill the 9am and 3pm readings

**Status:** todo

**Goal:** Give the 9am and 3pm facts about a year of history, from BOM's Daily Weather Observations (DWO). The user wants this done after the site is live.

- Background:
  - DWO keeps the current month and the 12 before it, one CSV per station per month, at `https://www.bom.gov.au/climate/dwo/YYYYMM/text/<product>.YYYYMM.csv`. The CSV columns include 9am and 3pm temperature and relative humidity.
  - These are on BOM's website, so the user downloads them by hand in a browser. Code must never fetch them.
  - `IDCJDW2124` is Sydney, and its temperature and humidity come from Observatory Hill (066214). The user also found `IDCJDW2125`. Find the products for Sydney Airport and Sydney Olympic Park, and check which station each file's header names.
  - Use only the temperature and humidity columns. The Sydney file takes its cloud and pressure from Sydney Airport and its wind from Fort Denison.
- Scope: give the user the list of files to download, and add it to [refreshing-history.md](refreshing-history.md).
- Scope: a parser for the DWO CSVs, which checks that the header names the expected station.
- Scope: adding the backfilled readings to the saved readings from task 6, for dates before saving began. On overlapping dates the two must agree, or the build fails.
- Done when: tests cover parsing, the station check and the overlap check, and the 9am and 3pm records start about a year earlier.

**Notes:**

---

## 17. Longer solar history from the IDCJAC0016 ZIPs

**Status:** todo

**Goal:** Solar history back to about 1990 from BOM's free daily solar exposure ZIPs (product `IDCJAC0016` in Climate Data Online), instead of only from 2009 (2011 at Olympic Park). The user wants this done after the site is live.

- Background: task 6b saves the FTP daily files' solar values in `data/ftp-history/`. Climate Data Online also has a daily solar exposure ZIP for each station, which may hold the same values over a much longer period. It is on BOM's website, so the user downloads it by hand. Code must never fetch it.
- Scope: list the download links for 066062, 066214, 066037 and 066212 in [refreshing-history.md](refreshing-history.md), and wait for the user to download them. A station's page is `https://www.bom.gov.au/jsp/ncc/cdio/weatherData/av?p_nccObsCode=193&p_display_type=dailyDataFile&p_startYear=&p_c=&p_stn_num=<station>`, with **All years of data** at the top right (the `193` is unconfirmed).
- Scope: check that the ZIPs match the FTP solar values on the dates they share.
  - If they do, load them like the other ZIPs (the CSV columns probably differ, so the loader needs that product's headers), and layer them ZIP first, then the FTP history, like the temperature ZIPs.
  - If they don't, record why in the notes and keep the FTP values only.
- Scope: update the data sources section of CLAUDE.md, and the solar history's start date in task 7's wording.
- Done when: the comparison is recorded in the notes, and either the solar series starts about 1990 with tests covering the loader and layering, or the reason it doesn't is recorded.

**Notes:**
