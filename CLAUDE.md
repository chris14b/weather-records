# Sydney weather records

A static website that shows obscure weather records for the current and recent weather in Sydney, for example "the warmest night of the year so far" or "the 7 days to Sunday are forecast to be the wettest 7 days since 2022". It is built entirely by AI sessions, one task from [docs/plan.md](docs/plan.md) per session.

## How to work in this repo

- Each session does **one** task from `docs/plan.md`: the first one that isn't deferred or blocked and whose dependencies are all finished, unless told otherwise. Don't start the next task.
- Tasks have permanent IDs such as `T15`, never reused and never with a letter after them. Their order in the plan is their priority. The plan's own introduction has the rules.
- When a task is finished, delete it from the plan. First move what later sessions need into the open tasks, [docs/pipeline.md](docs/pipeline.md), [docs/facts.md](docs/facts.md) or this file. If a task is left unfinished, update its status and notes instead. If a decision below changes, update this file in the same session.
- Decisions recorded here are settled. Don't reopen them without asking.
- Before finishing, `npm test`, `npm run typecheck`, `npm run lint` and `npm run format:check` must all pass.
- File names in `docs/` are lowercase. Only `CLAUDE.md` and `README.md` are capitalised, because tools look for those names.
- When a task is finished, ask the user whether to commit it. One commit per task keeps the history readable.
- Git uses the personal account `chris14b` (GitHub: `chris14b/weather-records`), set in this repository's own git config. Never use `gh` here or change any global git config: both belong to the work account.

## Stack

- TypeScript throughout, on the current Node LTS (26, in `.nvmrc`), with npm.
- Vitest for tests, Vite for the website.
- The data pipeline and the website share the type definitions for `facts.json`.
- Node runs the pipeline's `.ts` files directly through type stripping, with no build step. So `erasableSyntaxOnly` is on (no enums, namespaces or parameter properties), and relative imports use the `.ts` extension.
- Type-checking uses two projects under `tsconfig.json`: `tsconfig.node.json` (pipeline, shared code, tests and config files; Node types, no DOM) and `tsconfig.site.json` (site and shared code; DOM, no Node types). So `src/shared/` must use neither Node nor DOM APIs.
- TypeScript is pinned to `~6.0`, because `typescript-eslint` supports only `<6.1`. Move to TypeScript 7 once it does.
- ESLint uses `typescript-eslint`'s `strictTypeChecked` and `stylisticTypeChecked`, configured in `eslint.config.js` (a `.ts` config would need `jiti`).
- Vite's root is `src/site`, and it builds to `dist/`. Vitest has its own `vitest.config.ts` so it doesn't inherit that root. Tests live in `test/` or next to the code as `*.test.ts`.

## Website

- Designed for desktop first. It must still be easy to read and use on a phone.
- Plain TypeScript and the DOM, with no framework. Styles are one CSS file, apart from the development-only sky preview's, which load with it.
- One page that scrolls. Frosted glass panels sit over a sky that follows the sun. A small title, "Sydney Weather Records" in title case, and a toggle for the three locations are at the top.
- The panels run Today, Coming week, Past week, Past month. They are for the viewer's date, so the page turns over at midnight rather than at the next update: each update writes a page for its own date and one for the next.
- Today has the newest observations: last night's minimum, the rain to 9am, and the day's maximum and other values as the updates bring them in. After midnight, until the morning update, it keeps the day before's maximum and other daytime values, while that day's night and rain to 9am move to Past week. Once the morning update brings the new night and rain, the day before's maximum moves to Past week too.
- Today also has the forecasts that end by 9am tomorrow: today's maximum, tonight's low and the rain to 9am tomorrow, with their "if it gets there" facts. After midnight that includes the night under way, named by its weekday ("Sunday night").
- Past week and Past month count back from the viewer's today, so they aren't named "this week" or "this month", which would sound unfinished.
- Choosing a location puts it in the address, as `?location=<id>`, so a link opens the location it was copied from. Until the viewer chooses one, the address has no location, even when the remembered choice is shown. Choosing replaces the address rather than adding to the history. A location in the address wins over the remembered choice, and an unknown one is dropped from the address.
- Today leads with one big fact, sized by its score, so a record fills the screen and an ordinary day's fact stays small.
- Facts that stand out are marked by a glow around their status dot, with no text badge: a faint halo for a fact at least twice as rare as its section needs, and a slow pulse from a score of 6.5 in any section. "If it gets there" facts are never marked. Both go by raw score, not by rarity within a kind of period, so in a list sorted strongest first the marks sit at the top. The glow never changes the dot's shape, which shows the status. The pulse pauses when the tab is hidden and stands still with reduced motion, and screen readers hear the level instead.
- The background never shows the current weather, because `facts.json` is up to 8 hours old. The weather comes from BOM's forecast icon for the viewer's today. Each kind of sky is a few CSS layers over the time-of-day gradient, with no images. They pause when the tab is hidden and stand still with reduced motion.
- The time of day follows the sun's height at the selected location, worked out in the browser from the viewer's clock and redrawn every minute. `skyStyle` in `src/site/sky.ts` blends the sky's and the weather's colours between a few heights of the sun, from deep night to midday. The glow follows the sun's arc as if facing north, towards the midday sun: across by the time of day (the hour angle), from the right in the morning to the left in the evening, and up by the sun's height. So a summer arc is wide and nearly reaches the top, and a winter arc is narrow and low. Dawn and dusk keep their colours on clear and slightly cloudy days, show only a hint of them when it is cloudy, showery or foggy, and turn grey in rain and storms. Cloud also mutes the sun's glow.
- The icon is a frosted glass panel and the sun on a daytime sky, in `src/site/public/favicon.svg`. It sits on its own tile with a faint white edge, so it reads on light and dark tab bars. `apple-touch-icon.png` is the same design at 180 px with square corners, because iOS rounds them itself. Redraw the PNG from the SVG when the design changes (`sips -s format png` renders SVG on macOS).
- With `npm run dev`, adding `?sky` to the address opens a panel to try the sky at any date and time, in any weather, with a button to play through the day. It is left out of the site build, styles and all, and `test/site-build.test.ts` fails if any of it gets in.

## Hosting and updates

- The website is hosted on GitHub Pages at `https://chris14b.github.io/weather-records/` and contains only static files. Vite's `base` is `/weather-records/`, so `npm run dev` serves the site there too.
- `.github/workflows/deploy.yml` is the only workflow. It runs every 2 hours from 6:30am to 10:30pm Sydney time (`30 6,8,10,12,14,16,18,20,22 * * *` with `timezone: "Australia/Sydney"`, so the runs keep to Sydney's clock through daylight saving), on every push to `main`, and by hand (Actions → Deploy → Run workflow, on `main`). There are no backup runs. Its actions are pinned to commit SHAs, with the version in a comment.
- What the runs bring, with daylight saving (BOM's schedules are fixed in UTC, so without it they come an hour earlier by Sydney's clock):
  - **10:30am** is the first run with last night's minimum, the rain to 9am and the 9am reading. The daily files update at 9:34am and BOM's 10am forecast was out at 9:45am on 2026-11-09. The 6:30am and 8:30am runs have nothing new observed, only BOM's 4am forecast.
  - **4:30pm** is the first run with the 3pm reading and today's maximum (see the next point), and the 6:30pm run the first with BOM's 4pm forecast.
  - **10:30pm** is the last, and the first with the maximum from its whole 6am–9pm window and BOM's 10pm forecast. Overnight, until 6:30am, the page has that run's facts and its page for tomorrow.
  - BOM issues its routine forecasts at 17:00, 23:00, 05:00 and 11:00 UTC. The latest observations appear about 5 minutes after each half-hour reading.
- The live maximum's window runs to 9pm, but the running maximum is saved from 4pm, so the afternoon runs can say how the day compares. Each later run overwrites it, up to the 10:30pm run's final value (`maxSavedFromHour` in `src/pipeline/observations.ts`). A value whose every run is skipped waits for the daily file, two days later.
- Every run does the same work, and its facts reflect the time it ran. Running twice in a row must be harmless.
- Missed runs must never leave a permanent gap. We don't keep our own archive: store only data that BOM still offers, and no longer than BOM keeps it. Then anything missed can be fetched again, automatically where the feed allows, otherwise by hand (the ZIPs and the Daily Weather Observations).
- Each run checks the code, downloads the BOM FTP feeds, updates `data/recent/` and `data/ftp-history/`, commits them if they changed, then builds `facts.json` into the site and deploys it. It runs on `main` only, and never overlaps another run (concurrency group `pages`). A push by the run's own `GITHUB_TOKEN` doesn't start another run. If BOM's FTP is down, the run fails and the site keeps its last deployment, so a code change waits for the next run that can reach BOM.
- `npm run build:data` writes `facts.json` to `src/site/public/`, Vite's public directory, so `npm run dev` serves it and the site build copies it into `dist/`. It is a build output, ignored by git, so run `build:data` before `npm run dev`.
- The footer says when the next update is due ("Next update due around 12:30pm"), and that it is running late once that time passes without a new `facts.json`. The page fetches `facts.json` again every 5 minutes to find out. The run times are `updateRunsSydney` in `src/shared/schedule.ts`, and a test fails if they don't match `deploy.yml`.
- There is no server, and nothing updates on demand.

## Locations

| Location                  | Stations (joined by date)                            | Forecast area                     |
| ------------------------- | ---------------------------------------------------- | --------------------------------- |
| Sydney - Observatory Hill | 066062 until 2020-08-31, then 066214 from 2020-09-01 | Sydney (`NSW_PT131`)              |
| Sydney Airport            | 066037 (Sydney Airport AMO)                          | Mascot (`NSW_PT272`)              |
| Sydney Olympic Park       | 066212 (Sydney Olympic Park AWS, Archery Centre)     | Sydney Olympic Park (`NSW_PT132`) |

- Use BOM's own names and identifiers. A location is named by its current station's `description` in the observations feed, and its forecast area is matched by AAC code. Never name a location after a nearby suburb, in code, docs or on the site.
- The joins are defined in config, not by merging files. Joining is by fixed cutover date. Never fill one station's gaps with another station's values.
- The Observatory Hill stations differ: the new one reads about 0.3°C warmer for maximums and cooler for minimums. The site carries a note about the 2020 station change.
- The Olympic Park record starts in 2011. Facts from such a short record are worth less, and scoring must reflect that.

## Data sources

Use only these. **Never fetch from `www.bom.gov.au` or `api.weather.bom.gov.au` in code.** BOM blocks automated access to its website, and its app API forbids reuse. How the pipeline reads and saves each source, and the quirks of BOM's files, are in [docs/pipeline.md](docs/pipeline.md).

1. **History:** the Climate Data Online ZIPs in `data/raw/`, downloaded by hand and replaced when refreshed. The download links and steps are in [docs/refreshing-history.md](docs/refreshing-history.md). Filenames are `IDCJAC0009_<station>_1800.zip` (rainfall), `IDCJAC0010_…` (max temperature) and `IDCJAC0011_…` (min temperature). Read them directly as ZIPs, and find them by product code and station number. The CSV columns are product, station, year, month, day, value, period in days, and quality (`Y` = checked, `N` = not yet checked).
2. **Recent daily values:** monthly CSVs at `ftp://ftp.bom.gov.au/anon/gen/clim_data/IDCKWCDEA0/tables/nsw/<folder>/<folder>-YYYYMM.csv`. The folders are `sydney_(observatory_hill)`, `sydney_airport_amo` and `sydney_olympic_park_(archery_centre)`. These files run one to two days behind and cover 2009 onwards (August 2011 onwards at Olympic Park). Blank cells mean missing. They also have each day's highest and lowest relative humidity and its solar radiation. The ZIPs have none of those three, so their history is backfilled from these files into `data/ftp-history/` and never pruned. Each folder's first month and any months it has no file for are set in config: the Observatory Hill folder has none from 2018-04 to 2020-07, so those measures are missing there for that period. Any other missing month fails the build.
3. **Live observations:** `ftp://ftp.bom.gov.au/anon/gen/fwo/IDN60920.xml` (latest observations for every NSW station). It includes the running max for 6am–9pm, the overnight min for 6pm–9am, and rain to 9am.
4. **9am and 3pm readings:** `ftp://ftp.bom.gov.au/anon/gen/fwo/IDN60910.tgz`. It holds one JSON file per NSW station, named by WMO number (`IDN60910.<wmo>.json`), with the last 72 hours of half-hourly observations. The WMO numbers are 94768 (Observatory Hill), 94767 (Sydney Airport) and 95765 (Sydney Olympic Park). Save the temperature (`air_temp`) and relative humidity (`rel_hum`) from the 09:00 and 15:00 readings only. BOM's Daily Weather Observations (DWO) keep the last 13 months of these on its website. The user downloads them by hand to backfill or fill a gap (T20). So the saved readings cover at most the last 13 months: prune anything older.
5. **Forecast:** `ftp://ftp.bom.gov.au/anon/gen/fwo/IDN11060.xml` (the 7-day forecast for NSW towns). Rain comes as a range; the lower bound is the amount with a 50% chance, and the upper bound the amount with a 25% chance.
6. **Sunrise and sunset:** calculated from each station's latitude and longitude. No API is used.

When sources disagree, the ZIPs win, then the FTP daily files, then the job's own live snapshots. The saved copies in `data/recent/` for dates the ZIPs now cover can be deleted.

The build must **fail loudly** in any of these cases rather than publish wrong facts:

- a ZIP is missing
- the station or product in a file doesn't match its name
- the column headers have changed
- there is a gap between the end of the ZIP history and the start of the recent data

## BOM data conventions

- Rain is the 24 hours to 9am, credited to the date on which those 24 hours end.
- The official maximum is for the 24 hours from 9am. The official minimum is for the 24 hours to 9am.
- The live feed's 6am–9pm maximum is close to the official figure but not identical. Treat it as **provisional** until the daily files confirm it.
- A rain value with a period longer than 1 day is a multi-day total. Sydney Airport has 17 of these. Never treat one as a single-day value.
- Missing days are missing. Never count a streak or a period total through a gap.

## Facts

How facts are made, ranked, chosen and worded is explained in [docs/facts.md](docs/facts.md). Keep it in step with the code.

- **Comparisons:** against all records, this year, the same month in every year, the same calendar date, and the same season. Don't compare against the same weekday.
- **Ranks:** a fact can give a rank, such as "the 2nd coldest" or "the equal 3rd wettest", not only "the coldest". Tied values share a rank.
- **Scoring:** narrow comparisons and short records score lower, because they make records easy to set. An outright all-time record always shows, however short the record. Show a small number of the best facts, without near-duplicates.
- **Recent days:** facts cover the last 31 days, not just the latest, for the home page's Today, Past week and Past month sections. Each day is judged against the data as it stood on that day, and a fact that a later day has beaten isn't shown.
- **Dates:** every fact carries the date it refers to. The page decides whether to say "today" or "yesterday", based on when it is viewed.
- **Wording:** distinguish observed and forecast facts. The live feed is treated as fact: the page shows a provisional fact exactly like a confirmed one, as "Observed". `facts.json` keeps the `provisional` status. Sentences give the value with its unit, name a minimum by its night ("last night") and a day's rain as "the 24 hours to 9am", say "since records began in 1859" rather than "on record", and don't repeat what the subject already says ("Last night was the coldest since…", "October was the wettest since…").
- **Daylight:** the earliest and latest sunrise and sunset and the longest and shortest day are facts of their own, from the year's curve rather than ranks. They have their own mark on the page, never a standout mark, and are "of the year" only if no other day of the year beats them on the clock, which daylight saving can do; otherwise they are "of" their season.
- **Attribution:** the data is © Bureau of Meteorology, licensed under CC BY 4.0. The site must credit it.
