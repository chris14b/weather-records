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
- One page that scrolls. Frosted glass panels sit over a sky that follows the sun. A small title and a toggle for the three locations are at the top.
- The panels run Today, Coming week, This week, This month. Today's forecast and "if today reaches…" facts go in Today.
- Today leads with one big fact, sized by its score, so a record fills the screen and an ordinary day's fact stays small.
- The rarest facts carry a text badge, "Rare" or "Exceptional", separate from the status dots, so marks stay rare and don't rely on colour.
- The background never shows the current weather, because `facts.json` is up to 12 hours old. The weather comes from BOM's forecast icon for the viewer's today. Each kind of sky is a few CSS layers over the time-of-day gradient, with no images. They pause when the tab is hidden and stand still with reduced motion.
- The time of day follows the sun's height at the selected location, worked out in the browser from the viewer's clock and redrawn every minute. `skyStyle` in `src/site/sky.ts` blends the sky's and the weather's colours between a few heights of the sun, from deep night to midday. The glow follows the sun's arc as if facing north, towards the midday sun: across by the time of day (the hour angle), from the right in the morning to the left in the evening, and up by the sun's height. So a summer arc is wide and nearly reaches the top, and a winter arc is narrow and low. Dawn and dusk keep their colours on clear and slightly cloudy days, show only a hint of them when it is cloudy, showery or foggy, and turn grey in rain and storms. Cloud also mutes the sun's glow.
- With `npm run dev`, adding `?sky` to the address opens a panel to try the sky at any date and time, in any weather, with a button to play through the day. It is left out of the site build, styles and all, and `test/site-build.test.ts` fails if any of it gets in.

## Hosting and updates

- The website is hosted on GitHub Pages and contains only static files.
- A GitHub Actions workflow runs twice a day, each time with a backup run two hours later in case GitHub skips one. Times are in UTC, so Sydney time shifts by an hour with daylight saving.
  - **Morning:** `45 23 * * *`, backup `45 1 * * *` (10:45am with daylight saving, 9:45am without). By then last night's minimum, the rain to 9am and the 9am reading are final, and BOM has issued today's forecast. This run gives "if today reaches…" facts.
  - **Evening:** `15 11 * * *`, backup `15 13 * * *` (10:15pm or 9:15pm). By then today's maximum and the 3pm reading are in.
- Every run does the same work, and its facts reflect the time it ran. Running twice in a row must be harmless.
- Missed runs must never leave a permanent gap. We don't keep our own archive: store only data that BOM still offers, and no longer than BOM keeps it. Then anything missed can be fetched again, automatically where the feed allows, otherwise by hand (the ZIPs and the Daily Weather Observations).
- Each run downloads the BOM FTP feeds, updates `data/recent/`, regenerates `facts.json`, commits the data and deploys the site.
- `npm run build:data` writes `facts.json` to `src/site/public/`, Vite's public directory, so `npm run dev` serves it and the site build copies it into `dist/`. It is committed with the data, so the deploy needs no data step.
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
- **Scoring:** narrow comparisons and short records score lower, because they make records easy to set. Show a small number of the best facts, without near-duplicates.
- **Recent days:** facts cover the last 31 days, not just the latest, for the home page's Today, This week and This month sections. Each day is judged against the data as it stood on that day, and a fact that a later day has beaten isn't shown.
- **Dates:** every fact carries the date it refers to. The page decides whether to say "today" or "yesterday", based on when it is viewed.
- **Wording:** distinguish observed and forecast facts. The live feed is treated as fact: the page shows a provisional fact exactly like a confirmed one, as "Observed". `facts.json` keeps the `provisional` status. Sentences give the value with its unit, name a minimum by its night ("last night") and a day's rain as "the 24 hours to 9am", say "since records began in 1859" rather than "on record", and don't repeat what the subject already says ("Last night was the coldest since…", "October was the wettest since…").
- **Daylight:** the earliest and latest sunrise and sunset and the longest and shortest day are facts of their own, from the year's curve rather than ranks. They have their own mark on the page, never a standout badge, and are "of the year" only if no other day of the year beats them on the clock, which daylight saving can do; otherwise they are "of" their season.
- **Attribution:** the data is © Bureau of Meteorology, licensed under CC BY 4.0. The site must credit it.
