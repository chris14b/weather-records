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

**Status:** todo

**Goal:** Read the Climate Data Online ZIPs in `data/raw/` into typed daily records.

- Scope: find ZIPs by product code and station number, then read the CSV inside without unzipping to disk.
- Scope: parse each day as date, measure, value, period in days, and quality. Keep multi-day totals and quality flags rather than dropping them.
- Scope: validation that throws a clear error for a missing file, the wrong station or product, or changed headers.
- Out of scope: joining stations, FTP data.
- Done when: tests pass against small fixture ZIPs that cover every validation error, and loading the real files returns the known records: 45.8°C at 066062 on 2013-01-18, and 327.6 mm at 066062 on 1986-08-06.

**Notes:**

---

## 4. Locations config and station joining

**Status:** todo

**Goal:** Turn the station histories into one daily series per location.

- Scope: a config listing each location, its stations with their cutover dates, its forecast location name, and its latitude and longitude. The values are in CLAUDE.md.
- Scope: join by cutover date only. Each value records which station it came from.
- Out of scope: FTP data and layering by source.
- Done when: tests cover the Observatory Hill cutover (2020-08-31 comes from 066062, 2020-09-01 from 066214) and confirm that gaps are not filled across stations.

**Notes:**

---

## 5. FTP daily files and layering

**Status:** todo

**Goal:** Keep `data/recent/` up to date from the FTP daily files, and layer that data over the history.

- Scope: an FTP client (e.g. `basic-ftp`) with timeouts and retries.
- Scope: a parser for the monthly `IDCKWCDEA0` CSVs (blank cells mean missing).
- Scope: a save format in `data/recent/` that is readable in a diff, such as one CSV per station.
- Scope: layering by priority (ZIP, then FTP daily, then snapshot), recording the source of each value.
- Scope: pruning saved copies for dates the ZIPs cover, and the gap check between the ZIP history and the recent data.
- Out of scope: live observations, forecast.
- Done when: tests with fixture files cover parsing, priority, pruning and the gap error, and a manual smoke script fetches the real current month for one station.

**Notes:**

---

## 6. Live observations and forecast

**Status:** todo

**Goal:** Capture the evening snapshot and the 7-day forecast for each location.

- Scope: a parser for `IDN60920.xml`. Save today's provisional max, last night's min and rain to 9am for each station into `data/recent/`.
- Scope: a parser for `IDN11060.xml`, giving the forecast for each location by its forecast-location name: daily max and min, chance of rain, and the rain amounts with 50% and 25% chances.
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
