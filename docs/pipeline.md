# How the pipeline reads and saves data

This explains how the pipeline gets each location's daily data from BOM, what it saves, and the quirks in BOM's files that the code relies on. How that data becomes facts is in [facts.md](facts.md). The sources themselves, and the rules about them, are in [CLAUDE.md](../CLAUDE.md).

## Modules

All in `src/pipeline/`, except the config, the `facts.json` types and the forecast icon codes in `src/shared/`.

| Area                   | Modules                                                                                                                                                                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Locations and stations | `src/shared/locations.ts` (`locations`, `currentStation`, `stationOffsets`), `stations.ts` (`loadLocationHistory`, `joinStations`)                                                                                                                   |
| History ZIPs           | `history.ts` (`loadHistory`)                                                                                                                                                                                                                         |
| FTP                    | `ftp.ts` (`connectToBom`, `withDownloadCache`)                                                                                                                                                                                                       |
| FTP daily files        | `daily-files.ts` (parser, `downloadDailyFile`, `folderMonths`), `recent.ts` (`updateDailyFiles`), `ftp-history.ts` (`updateFtpHistory`)                                                                                                              |
| Live feeds             | `observations.ts` (IDN60920), `readings.ts` (IDN60910), `forecast.ts` (IDN11060), `snapshots.ts` (`downloadLiveFeeds`, `updateSnapshot`), `xml.ts`                                                                                                   |
| Daily Weather Obs.     | `dwo.ts` (`parseDwo`, `addDwoReadings`, `missingReadings`, `downloadPage`), `import-dwo.ts` (`npm run import:dwo`)                                                                                                                                   |
| Layering and series    | `layering.ts` (`layerRecent`), `series.ts` (`locationSeries` and one function per kind of series), `saved-series.ts` (`dataDirs`, `loadHistories`, `historyEnd`, `seriesFromSources`, and `readSavedSeries`, which builds the series from disk only) |
| Facts                  | `candidates.ts`, `daily-facts.ts`, `period-facts.ts`, `forecast-facts.ts`, `thresholds.ts`, `scoring.ts`, `selection.ts`, `wording.ts`                                                                                                               |
| Shared helpers         | `saved-table.ts` (the saved CSV files), `dates.ts` (`sydneyDate`, `sydneyHour` and date arithmetic), `errors.ts` (`inContext`)                                                                                                                       |
| The build              | `facts-file.ts` (`buildFactsFile`, `writeFactsFile`, `factsPath`)                                                                                                                                                                                    |
| Commands               | `build-data.ts` (`npm run build:data`), `backfill-ftp-history.ts`, `import-dwo.ts`, and the `smoke-*.ts` scripts                                                                                                                                     |

Every error from a file names the file and the line or element (`inContext`).

## Saved files

| Path                                  | Holds                                                         | Columns                                    | Pruned                                                            |
| ------------------------------------- | ------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------- |
| `data/raw/`                           | the history ZIPs, downloaded by hand                          | BOM's                                      | replaced when refreshed                                           |
| `data/recent/daily/<station>.csv`     | FTP daily values the ZIPs don't cover yet                     | `date,rain,maxTemp,minTemp`                | up to the location's history end                                  |
| `data/recent/snapshots/<station>.csv` | live-feed values (provisional)                                | `date,rain,maxTemp,minTemp`                | up to the location's history end                                  |
| `data/recent/readings/<station>.csv`  | the 9am and 3pm readings, from IDN60910 and the DWO           | `date,temp9am,relHum9am,temp3pm,relHum3pm` | before `readingsKeptFrom(today)`, the 1st of the month a year ago |
| `data/ftp-history/<station>.csv`      | humidity, wind and solar from every FTP daily file since 2009 | `date,maxRelHum,minRelHum,wind,solar`      | never                                                             |

- All of them are read and written by `saved-table.ts`. Each file has a schema of its columns, each a `number` or `text`. Text can't hold commas, quotes or line breaks; writing one fails.
- Saved files have a row for every day their source covered, even an all-blank one, so a blank row still records that the day was covered.
- `mergeRows` merges cell by cell: a fresh value replaces a saved one, and a missing fresh value leaves it alone.
- Numbers are written as JavaScript prints them, so BOM's `32.70` is saved as `32.7`.
- A location's **history end** is the earliest of its three last ZIP dates (from `loadLocationHistory`). A file is deleted when pruning empties it.
- Every updater writes the same files when run twice.

## Stations and joining

- Each location's `stations` lists its stations in order. Every station after the first has a `from` date, and supplies values from then until the next station's `from`. `joinStations` throws on a bad config, and each joined record gains a `station`.
- Each station has its official `name` (its `stn-name` in IDN60920), its FTP `dailyFolder`, and, for the current stations only, its `wmo`. 066214 also has `reads`: how much higher it reads than 066062 (+0.3°C maximum, −0.3°C minimum).
- Coordinates are the current station's, to four decimal places, from IDN60920.
- The Observatory Hill cutover hides a gap-filling trap: 066062 has no maximum for 2020-08-31 but 066214 does, so the joined series has none. 066214's records from before 2020-09-01 (it opened in 2017) are dropped.

## The history ZIPs

- Found by the `<product>_<station>_` prefix; two matching ZIPs is an error. Read in memory with `fflate`.
- Rows with a blank value are left out, so a missing day has no record. Some blank values have a period of 1; these are missing too.
- `periodDays` is `null` where the file leaves it blank: most Observatory Hill rain before about 1970 and a few hundred Sydney Airport rows. How the series treat these is in the Series section of [facts.md](facts.md).
- Sydney Airport rain has one row with period `0` (1994-07-04, 0.0 mm) and 16 multi-day totals. Observatory Hill has one 2-day maximum and one 2-day minimum (1996-06-30).
- `quality` is `null` on a handful of rows where the file leaves it blank.
- Rows must be in strictly increasing date order with 8 columns and well-formed values, periods and quality flags.

## The FTP daily files

- `connectToBom()` connects anonymously with a 30 s timeout and 3 attempts, reconnecting between them. A 550 reply means no such file, and returns `undefined` without retrying.
- The files are Latin-1, not UTF-8 (the `°C` header). The first line says `'IDCKWCDE51`, and the third says "South Australia" even for NSW. Blank cells hold a single space.
- There's no station number in a file. The title line and every row name the station by its official name minus " AWS" (`SYDNEY OLYMPIC PARK (ARCHERY CENTRE)` for 066212), and the parser checks both. That rule holds for 512 of the 517 stations in BOM's `IDCKWCDEA0/tables/stations_db.txt`.
- The four column header lines are checked exactly. Rows run day by day from the 1st (after any leading rows from the month before), and the file ends with its `Totals:` line, so a truncated or gappy file fails.
- The current month's file holds the days published so far, and a future month's doesn't exist.
- Early in a month, the current month's file starts with the last days of the month before, so that it shows at least 7 days. The file from 2026-11-06 ran from 30 October to 5 November, and the one from 2026-11-08 from 1 to 7 November. Its title still names the current month, and the earlier rows match the month before's file. The parser leaves out leading rows from the month before, as long as they run up to its last day. A file with only those rows gives no days, and any other row outside the month fails.
- The values follow the ZIP conventions exactly: where both have a value for a date, they agree. The FTP files have gaps that the ZIPs later fill.
- FTP rain is always a single day. Where Sydney Airport's ZIP has a multi-day total, the FTP file has daily values that differ a little (22.2 mm in the ZIP against 21.4 mm over 3 days to 2026-03-20). They seem to come from the automatic gauge rather than the manual one. The ZIP wins once it covers the date.
- The format hasn't changed since 2009.

### Folders

- The FTP server has no list linking folders to station numbers (`stations_db.txt` has 109 NSW stations, but there are 132 NSW folders), so each station's `dailyFolder` names its folder, its first month (`from`) and the months it has no file for (`missing`).
- The Observatory Hill folder held 066062's values before 2020, so both its stations share it. It has **no files from 2018-04 to 2020-07**, and no other Sydney folder covers that time, so Observatory Hill has no humidity or solar from 2018-03-25 (the last week of March is blank) to 2020-07-31.
- The wind column is the day's average speed at 10 m, in m/s. Observatory Hill has no anemometer, and every one of its 5,644 days from 2009 to 2026-11-11 says `0.00`, so the parser reads a wind of `0.00` as missing. No station with an anemometer averaged a calm day: Sydney Airport's 6,517 days ran from 1.36 to 18.54 m/s (2015-04-21), and Olympic Park's 5,540 from 0.19 to 7.69 m/s. Olympic Park's site is sheltered, so its wind is much lighter than the airport's on the same day.
- The Observatory Hill and Sydney Airport folders start in 2009-01. The Olympic Park (Archery Centre) folder starts in 2011-08, whose rows are all blank; its first values are on 2011-09-01. A second folder, `sydney_olympic_park_(sydney_olympic_pk_a)`, is an older station whose last file is 2011-08.

### Updating

- `updateDailyFiles` fetches every month from the one holding the first day after the later of the history end and the last saved day, up to the current Sydney month. Fetched months replace their saved rows. A missing current-month file is skipped; any earlier missing month is an error. It saves rain, max and min only.
- `updateFtpHistory` does both the backfill and the update. A new column means starting again: move the old files aside, run `npm run backfill:ftp-history` (about a minute), and check the other columns match. The wind column was added that way on 2026-11-13, and every other cell was unchanged. For each station, it fetches from the month after its last saved day (or its folder's first month) up to the current month, within the station's own period, and writes after every month so an interrupted run resumes. `npm run backfill:ftp-history` runs it for every location.
- Wrap the connection in `withDownloadCache` so the two download the current month only once.

## The live feeds

`downloadLiveFeeds(ftp)` downloads all three feeds once, since each covers all of NSW. `updateSnapshot` then saves each location's observations and readings.

### Observations (IDN60920)

- The station is found by `bom-id`, and its `stn-name`, `description` and `wmo-id` are checked.
- `rainfall_24hr` must run 9am to 9am, `minimum_air_temperature` 6pm to 9am and `maximum_air_temperature` 6am to 9pm, or the build fails.
- Rain and the minimum are used only once their window's `end-time-utc` is at or before the observation's time. The maximum is saved from 4pm on its window's start date (`maxSavedFromHour`), before its window closes at 9pm, so a skipped 10:30pm run still leaves a value. Each run from then overwrites it, up to the 10:30pm run's final value. Rain and the minimum are credited to the day the window ends, the maximum to the day it starts. This relies only on each element's own times, not on when BOM rolls them over.
- `parseRunningValues` reads what is still open instead, never saved: the maximum before 9pm, the minimum before 9am, and the `rainfall` element, the rain since the last 9am. That must start at 9am and run for at most a day, or the build fails, and is credited to the day after it starts, the 24 hours to 9am it is part of. Each carries the period's `time-utc` as `observedAt`. The build takes them out of the saved observations with `withoutRunning`, so the maximum saved from 4pm is used only as a running value until 9pm.
- So a run before 4pm never saves or overwrites a maximum, and a run after 6pm never saves a minimum, because by then the minimum's window runs to tomorrow's 9am. If no run reads a value, it is left to the daily file, two days later.
- The snapshot minimum covers 6pm–9am, not the official 9am–9am, so like the maximum it is provisional.

### Readings (IDN60910)

- The `.tgz` is read in memory (`nanotar` for the tar, `fflate` to gunzip). Each station's file is `IDN60910.<wmo>.json`.
- The JSON has no station number, only `wmo` and `name` (the location's name), and both are checked on the header and on every row.
- It holds 144 half-hourly rows (72 hours, oldest at 3pm three days back) plus special observations at odd minutes, which are ignored. Only rows at exactly `090000` or `150000` local time are used.
- `air_temp` and `rel_hum` must be in every row, as a number or null. Every other field is ignored. Two rows at the same time must agree on those two fields.

### Forecast (IDN11060)

- `parseForecast(feed, location.forecastArea)` finds the area by AAC code and checks its description.
- Each `forecast-period` is one local day, checked to be consecutive and to end at midnight. Temperatures must be whole numbers, the chance must look like `80%`, and the rain range like `0 to 8 mm`; any other format fails the build.
- Day 0 has no minimum. An afternoon issue has no maximum for today either: at 4:40pm on 2026-11-06, the feed had today with a 0% chance and no temperatures, then 7 more days.
- Days with a low chance often have no `precipitation_range`, so `rain50` and `rain25` are null. The Forecasts section of [facts.md](facts.md) says when that counts as 0 mm.
- Every day had a `forecast_icon_code` and a `precis` on 2026-11-09, but either can be missing, and is then null. An icon code BOM doesn't use (`weatherForIcon` in `src/shared/weather.ts`, which maps the codes to the site's kinds of sky) fails the build. The codes seen that day were 1, 3, 4, 9, 11, 16 and 17, and code 16 covers every précis that mentions a storm, including "Possible storm".
- Each location's `forecast` in `facts.json` gives each day's date, icon code and précis, from the day of the run.
- The forecast isn't saved.

## The Daily Weather Observations

BOM's website keeps a CSV per station per month for the current month and the 12 before it. The user downloads them by hand into `data/dwo/` (ignored by git), following [refreshing-history.md](refreshing-history.md), and `npm run import:dwo` adds them to the saved readings. The build never reads them. Each current station's product is its `dwo` in `src/shared/locations.ts`. They were first imported on 2026-11-13, filling every location from 2025-11-01.

- Files are named `<product>.YYYYMM.csv`, and the name must match the station's product. They are Latin-1 with CRLF line ends (the `°C` in the headers), and the last line has no line end.
- Quoted lines above the column headers give the title, when it was prepared, the copyright, and which station each kind of observation is from, as `{station 066214}`. Only a line with a station counts. If a file names one station, it must be the expected one. If it names several, as Sydney's does (`Temperature, humidity and rainfall observations are from Sydney (Observatory Hill) {station 066214}`, with pressure, cloud, evaporation and sunshine from Sydney Airport and wind from Fort Denison, each on its own line), every line that mentions temperature or humidity must name the expected station, and one must. Sydney Airport's and Olympic Park's each say `Observations were drawn from` their own station.
- The column headers are the line whose second cell is `Date`. The four columns used are found by name without their unit (`9am Temperature`, `9am relative humidity`, `3pm Temperature`, `3pm relative humidity`), each exactly once. Every other column is ignored.
- Rows start with an empty cell, then the date as `2026-11-1`. They run day by day from the 1st of the file's month, and the current month's file ends with today, its 3pm values blank until they are taken. Blank cells are missing. Olympic Park's file for 2026-09 has no readings on 2026-09-02.
- `addDwoReadings` only fills values the saved readings are missing, and never replaces one. Where both have a value they must agree, or the import fails, listing every disagreement, before writing anything. Temperatures must be equal. Humidity may differ by 1% (`tolerances`): the DWO's seems to be worked out from the rounded temperature and dew point and then rounded, while the feed's comes from the unrounded values. On 2026-11-12 the 3pm humidity at Observatory Hill was 52% in the feed and 53% in the DWO (23.8 °C with a dew point of 13.6 °C gives 52.85%), and 45% against 46% at Olympic Park. The other 46 shared values agreed exactly. Readings before `readingsKeptFrom(today)` are dropped, as the runs drop them.
- `missingReadings` lists the days from `readingsKeptFrom(today)` to yesterday that are missing any of the four values, by month. `downloadPage` turns them into `data/dwo/download.html`, with a link to each month's CSV, marking the months whose file is already in `data/dwo/`. A day the DWO also leaves blank stays listed.

## Layering

`layerRecent` layers each measure in priority order. The ZIP history alone covers every date up to its own last record, so a day it's missing stays missing even if the FTP file has a value. After that, each day takes the first layer that has a value (FTP, then snapshot), so a snapshot can fill a day the FTP file leaves blank. FTP values get `periodDays: 1` and `quality: null`, and every record carries its `source` (`zip`, `ftp` or `snapshot`) and `station`.

The gap check fails when the first recent date after the history's end isn't the next day. Recent days with all-blank values still count as coverage.

## The build

`npm run build:data` runs `buildFactsFile` with a connection to BOM and the time now, then `writeFactsFile`. It takes about 15 s.

- It downloads the live feeds once, then takes the locations one at a time over the same connection, wrapped in `withDownloadCache`. For each, it loads the ZIP history (`loadHistories`, `historyEnd`), runs `updateDailyFiles`, `updateFtpHistory` and `updateSnapshot` with today in Sydney, builds the series with `seriesFromSources`, and generates the facts with the window ending today and the forecast from `forecastStart(now)`. It selects them twice, into a page for today and a page for tomorrow, so the site can turn over at midnight before the first run of the day.
- Every check in the steps above throws, so a bad file stops the run before `facts.json` is written. `writeFactsFile` writes to `facts.json.partial` and renames it, so a failed write leaves the last file in place. The data files a failed run has already updated are fine to keep: each holds only checked values that BOM still offers.
- A second run gives the same data files and the same facts. Only `generatedAt` changes. `facts.json` isn't committed, so only the data files' changes are.
- `generatedAt` is the time the run started, before anything is downloaded, not when BOM published the data. The observations are from the latest half-hourly reading before then, the forecast from BOM's latest issue, and the daily files run two days behind.
- To update by hand, run the Deploy workflow (Actions → Deploy → Run workflow, on `main`). Locally, `build:data` also updates `data/recent/`. Pull before committing that, since the workflow commits the data every 2 hours.
- `facts.json` is indented, so it is easy to read. It was about 90 kB on 2026-11-09.
- The first run, on 2026-11-09, left 2026-11-08 with no rain, maximum or minimum: the daily files ran to 11-07, and there was no snapshot from the day before. The next daily file fills it.

## Tests and trying things out

- Fixtures in `test/fixtures/` are real files, kept byte for byte (they're in `.prettierignore`): the October and November 2026 Observatory Hill daily files, IDN60920, IDN11060 and IDN60910.94768 from 2:30pm on 2026-10-30, trimmed to the Sydney stations and areas plus Canberra, and Sydney's DWO for October 2026 (`IDCJDW2124.202610.csv`). `test/dwo.test.ts` builds made-up DWO files with `dwoCsv`, laid out as that one is.
- Helpers build made-up files in the real formats: `test/daily-file.ts` (`dailyFile`, and `FakeFtp` for the FTP tests) and `test/live-feeds.ts` (`readingsJson`, and the `.tgz` around it). The history tests build fixture ZIPs in a temp directory from inline CSV text.
- Some tests read `data/raw/` and `data/ftp-history/` directly, including the selection snapshot tests, so refreshing the ZIPs can change them. Review the change before updating them with `npx vitest run -u`. The selection snapshots also read `data/recent/`, but cut every series at a fixed `dataEnd` (2026-11-08), so the data each run adds can't change them.
- `test/facts-file.test.ts` runs the whole build for Observatory Hill against `FakeFtp` serving the fixtures, as at 2:30pm on 2026-10-30, with the real ZIPs and a copy of `data/ftp-history/`.
- `npm run smoke:daily-files [location-id]` fetches and prints the current month's daily file. `npm run smoke:live` downloads the three live feeds and prints what each location would save, without saving anything. The facts scripts are listed in [facts.md](facts.md).
