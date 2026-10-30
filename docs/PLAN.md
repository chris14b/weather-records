# Build plan

One task per session, in order. Background and settled decisions are in [CLAUDE.md](../CLAUDE.md).

Statuses: `todo`, `in progress`, `done`, `blocked`. At the end of each session, update the task's status and add notes for later sessions under **Notes**.

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

**Status:** todo

**Goal:** Capture the evening snapshot and the 7-day forecast for each location.

- Scope: a parser for `IDN60920.xml`. Save today's provisional max, last night's min and rain to 9am for each station into `data/recent/`.
- Scope: a parser for `IDN11060.xml`, giving the forecast for each location by its forecast area's AAC code (`forecastArea.aac`), checking that the description still matches: daily max and min, chance of rain, and the rain amounts with 50% and 25% chances.
- Out of scope: turning any of this into facts.
- Done when: tests against saved fixture XML pass, and running a snapshot twice produces the same result.

**Notes:**

---

## 7. Fact generator: daily facts

**Status:** todo

**Goal:** Generate candidate facts for single days.

- Scope: measures are daily max, daily min, rain, hottest night (highest min), coldest day (lowest max) and daily range.
- Scope: comparisons against all records, this year, the same month in every year, and the same calendar date. Both highest and lowest.
- Scope: "since YYYY" logic: the most recent day that matched or beat the value.
- Scope: rules for missing data and multi-day totals, and a confirmed or provisional status on each fact.
- Scope: the types for `facts.json` in `src/shared/`.
- Out of scope: scoring, wording, periods longer than a day.
- Done when: tests on small made-up series pass, and the real data produces "hottest day on record" for Sydney on 2013-01-18.

**Notes:**

---

## 8. Scoring, selection and wording

**Status:** todo

**Goal:** Choose the few facts worth showing, and word them well.

- Scope: an unusualness score based on how many comparable days were beaten, how many years back the "since" goes, how narrow the comparison is, and how long the record is.
- Scope: removing near-duplicates, for example keeping only the strongest of "hottest this month" and "hottest this year" for the same day.
- Scope: picking the top N for each location.
- Scope: English wording templates with dates, plus a "why" payload (the value, the previous record holder, the values to compare against).
- Done when: snapshot tests pass for the selected facts on a few chosen real dates, and a short written review of their output is added to the notes.

**Notes:**

---

## 9. Facts for longer periods and streaks

**Status:** todo

**Goal:** Facts for weeks, months, seasons and years, plus streaks.

- Scope: rolling 7-day rain, months (full and to date), seasons, year to date, and calendar years.
- Scope: phrasing for periods still in progress, such as "hottest start to October on record".
- Scope: streaks, such as consecutive hot days or dry spells, which must not run through gaps.
- Done when: tests pass for each period type and for streaks that meet a gap.

**Notes:**

---

## 10. Forecast and sunrise/sunset facts

**Status:** todo

**Goal:** Facts about the coming week and about daylight.

- Scope: forecast highs and lows compared with the records ("tomorrow is forecast to be the hottest November day since…"), and the wettest-7-days forecast using the 50% rain amounts.
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
- Scope: fact cards with "today" or "yesterday" wording based on when the page is viewed, plus an expandable "why" with a small chart.
- Scope: a banner when the data is stale, the note about the Observatory Hill station change, and the BOM credit.
- Scope: mobile first, with dark mode and accessibility.
- Done when: it runs locally against a real `facts.json`, and has been checked in the browser at phone and desktop widths.

**Notes:**

---

## 13. GitHub Actions and Pages

**Status:** todo

**Goal:** The site updates itself every evening.

- Scope: a workflow on the two schedules plus a manual trigger. It runs the tests and `build:data`, commits `data/recent/` and `facts.json` when they change, and builds and deploys to Pages.
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
