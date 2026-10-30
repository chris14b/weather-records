# Sydney weather records

A static website that shows obscure weather records for the current and recent weather in Sydney, for example "the warmest night of the year so far" or "forecast to be the wettest 7 days since 2022". It is built entirely by AI sessions, one task from [docs/PLAN.md](docs/PLAN.md) per session.

## How to work in this repo

- Each session does **one** task from `docs/PLAN.md`: the first one not marked done, unless told otherwise. Don't start the next task.
- Before finishing, update the task in `docs/PLAN.md`: set its status, and add notes the next session needs (anything surprising, deferred, or changed). If a decision below changes, update this file in the same session.
- Decisions recorded here are settled. Don't reopen them without asking.
- Run `nvm use` before any npm command. Before finishing, `npm test`, `npm run typecheck`, `npm run lint` and `npm run format:check` must all pass.
- When a task is finished, ask the user whether to commit it. One commit per task keeps the history readable.
- Git uses the personal account `chris14b` (GitHub: `chris14b/weather-records`), set in this repository's own git config. Never use `gh` here or change any global git config: both belong to the work account.

## Stack

- TypeScript throughout, on the current Node LTS, with npm.
- Vitest for tests, Vite for the website.
- The data pipeline and the website share the type definitions for `facts.json`.

## Hosting and updates

- The website is hosted on GitHub Pages and contains only static files.
- A GitHub Actions workflow runs at `15 11 * * *` and `15 13 * * *` UTC: 10:15pm or 9:15pm Sydney time, depending on daylight saving, plus a backup run two hours later. Running it twice must be harmless.
- Each run downloads the BOM FTP feeds, updates `data/recent/`, regenerates `facts.json`, commits the data and deploys the site.
- There is no server, and nothing updates on demand.

## Locations

| Location     | Stations (joined by date)                            | Forecast location   |
| ------------ | ---------------------------------------------------- | ------------------- |
| Sydney       | 066062 until 2020-08-31, then 066214 from 2020-09-01 | Sydney              |
| Erskineville | 066037 (Sydney Airport)                              | Mascot              |
| Epping       | 066212 (Sydney Olympic Park, Archery Centre)         | Sydney Olympic Park |

- The joins are defined in config, not by merging files. Joining is by fixed cutover date. Never fill one station's gaps with another station's values.
- The Observatory Hill stations differ: the new one reads about 0.3°C warmer for maximums and cooler for minimums. The site carries a note about the 2020 station change.
- The Olympic Park record starts in 2011. Facts from such a short record are worth less, and scoring must reflect that.

## Data sources

Use only these. **Never fetch from `www.bom.gov.au` or `api.weather.bom.gov.au` in code.** BOM blocks automated access to its website, and its app API forbids reuse.

1. **History:** the Climate Data Online ZIPs in `data/raw/`, downloaded by hand and replaced when refreshed. The download links and steps are in [docs/refreshing-history.md](docs/refreshing-history.md). Filenames are `IDCJAC0009_<station>_1800.zip` (rainfall), `IDCJAC0010_…` (max temperature) and `IDCJAC0011_…` (min temperature). Read them directly as ZIPs, and find them by product code and station number. The CSV columns are product, station, year, month, day, value, period in days, and quality (`Y` = checked, `N` = not yet checked).
2. **Recent daily values:** monthly CSVs at `ftp://ftp.bom.gov.au/anon/gen/clim_data/IDCKWCDEA0/tables/nsw/<folder>/<folder>-YYYYMM.csv`. The folders are `sydney_(observatory_hill)`, `sydney_airport_amo` and `sydney_olympic_park_(archery_centre)`. These files run one to two days behind and cover 2009 onwards. Blank cells mean missing.
3. **Live observations:** `ftp://ftp.bom.gov.au/anon/gen/fwo/IDN60920.xml` (latest observations for every NSW station). It includes the running max for 6am–9pm, the overnight min for 6pm–9am, and rain to 9am.
4. **Forecast:** `ftp://ftp.bom.gov.au/anon/gen/fwo/IDN11060.xml` (the 7-day forecast for NSW towns). Rain comes as a range; the lower bound is the amount with a 50% chance, and the upper bound the amount with a 25% chance.
5. **Sunrise and sunset:** calculated from each station's latitude and longitude. No API is used.

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

- **Comparisons:** against all records, this year, the same month in every year, the same calendar date, and the same season. Don't compare against the same weekday.
- **Scoring:** narrow comparisons and short records score lower, because they make records easy to set. Show a small number of the best facts, without near-duplicates.
- **Dates:** every fact carries the date it refers to. The page decides whether to say "today" or "yesterday", based on when it is viewed.
- **Wording:** distinguish confirmed, provisional and forecast facts.
- **Attribution:** the data is © Bureau of Meteorology, licensed under CC BY 4.0. The site must credit it.
