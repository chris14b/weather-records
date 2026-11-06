# How the pipeline reads and saves data

This explains how the pipeline gets each location's daily data from BOM, what it saves, and the quirks in BOM's files that the code relies on. How that data becomes facts is in [facts.md](facts.md). The sources themselves, and the rules about them, are in [CLAUDE.md](../CLAUDE.md).

## Modules

All in `src/pipeline/`, except the config and the `facts.json` types in `src/shared/`.

| Area                   | Modules                                                                                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Locations and stations | `src/shared/locations.ts` (`locations`, `currentStation`, `stationOffsets`), `stations.ts` (`loadLocationHistory`, `joinStations`)                                               |
| History ZIPs           | `history.ts` (`loadHistory`)                                                                                                                                                     |
| FTP                    | `ftp.ts` (`connectToBom`, `withDownloadCache`)                                                                                                                                   |
| FTP daily files        | `daily-files.ts` (parser, `downloadDailyFile`, `folderMonths`), `recent.ts` (`updateDailyFiles`), `ftp-history.ts` (`updateFtpHistory`)                                          |
| Live feeds             | `observations.ts` (IDN60920), `readings.ts` (IDN60910), `forecast.ts` (IDN11060), `snapshots.ts` (`downloadLiveFeeds`, `updateSnapshot`), `xml.ts`                               |
| Layering and series    | `layering.ts` (`layerRecent`), `series.ts` (`locationSeries` and one function per kind of series), `saved-series.ts` (`readSavedSeries`, which builds the series from disk only) |
| Facts                  | `candidates.ts`, `daily-facts.ts`, `period-facts.ts`, `forecast-facts.ts`, `thresholds.ts`, `scoring.ts`, `selection.ts`, `wording.ts`                                           |
| Shared helpers         | `saved-table.ts` (the saved CSV files), `dates.ts` (`sydneyDate`, `sydneyHour` and date arithmetic), `errors.ts` (`inContext`)                                                   |
| Commands               | `build-data.ts` (`npm run build:data`), `backfill-ftp-history.ts`, and the `smoke-*.ts` scripts                                                                                  |

Every error from a file names the file and the line or element (`inContext`).

## Saved files

| Path                                  | Holds                                                   | Columns                                    | Pruned                                                            |
| ------------------------------------- | ------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------- |
| `data/raw/`                           | the history ZIPs, downloaded by hand                    | BOM's                                      | replaced when refreshed                                           |
| `data/recent/daily/<station>.csv`     | FTP daily values the ZIPs don't cover yet               | `date,rain,maxTemp,minTemp`                | up to the location's history end                                  |
| `data/recent/snapshots/<station>.csv` | live-feed values (provisional)                          | `date,rain,maxTemp,minTemp`                | up to the location's history end                                  |
| `data/recent/readings/<station>.csv`  | the 9am and 3pm readings                                | `date,temp9am,relHum9am,temp3pm,relHum3pm` | before `readingsKeptFrom(today)`, the 1st of the month a year ago |
| `data/ftp-history/<station>.csv`      | humidity and solar from every FTP daily file since 2009 | `date,maxRelHum,minRelHum,solar`           | never                                                             |

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
- The four column header lines are checked exactly. Rows run day by day from the 1st, and the file ends with its `Totals:` line, so a truncated or gappy file fails.
- The current month's file holds the days published so far, and a future month's doesn't exist.
- The values follow the ZIP conventions exactly: where both have a value for a date, they agree. The FTP files have gaps that the ZIPs later fill.
- FTP rain is always a single day. Where Sydney Airport's ZIP has a multi-day total, the FTP file has daily values that differ a little (22.2 mm in the ZIP against 21.4 mm over 3 days to 2026-03-20). They seem to come from the automatic gauge rather than the manual one. The ZIP wins once it covers the date.
- The format hasn't changed since 2009.

### Folders

- The FTP server has no list linking folders to station numbers (`stations_db.txt` has 109 NSW stations, but there are 132 NSW folders), so each station's `dailyFolder` names its folder, its first month (`from`) and the months it has no file for (`missing`).
- The Observatory Hill folder held 066062's values before 2020, so both its stations share it. It has **no files from 2018-04 to 2020-07**, and no other Sydney folder covers that time, so Observatory Hill has no humidity or solar from 2018-03-25 (the last week of March is blank) to 2020-07-31.
- The Observatory Hill and Sydney Airport folders start in 2009-01. The Olympic Park (Archery Centre) folder starts in 2011-08, whose rows are all blank; its first values are on 2011-09-01. A second folder, `sydney_olympic_park_(sydney_olympic_pk_a)`, is an older station whose last file is 2011-08.

### Updating

- `updateDailyFiles` fetches every month from the one holding the first day after the later of the history end and the last saved day, up to the current Sydney month. Fetched months replace their saved rows. A missing current-month file is skipped; any earlier missing month is an error. It saves rain, max and min only.
- `updateFtpHistory` does both the backfill and the update. For each station, it fetches from the month after its last saved day (or its folder's first month) up to the current month, within the station's own period, and writes after every month so an interrupted run resumes. `npm run backfill:ftp-history` runs it for every location.
- Wrap the connection in `withDownloadCache` so the two download the current month only once.

## The live feeds

`downloadLiveFeeds(ftp)` downloads all three feeds once, since each covers all of NSW. `updateSnapshot` then saves each location's observations and readings.

### Observations (IDN60920)

- The station is found by `bom-id`, and its `stn-name`, `description` and `wmo-id` are checked.
- `rainfall_24hr` must run 9am to 9am, `minimum_air_temperature` 6pm to 9am and `maximum_air_temperature` 6am to 9pm, or the build fails.
- A value is used only once its window's `end-time-utc` is at or before the observation's time. Rain and the minimum are credited to the day the window ends, the maximum to the day it starts. This relies only on each element's own times, not on when BOM rolls them over.
- So a morning run never saves or overwrites a maximum. Without daylight saving, the 9:15pm evening run saves the maximum only if the 9pm observation is already published; otherwise the backup run does.
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
- The forecast isn't saved.

## Layering

`layerRecent` layers each measure in priority order. The ZIP history alone covers every date up to its own last record, so a day it's missing stays missing even if the FTP file has a value. After that, each day takes the first layer that has a value (FTP, then snapshot), so a snapshot can fill a day the FTP file leaves blank. FTP values get `periodDays: 1` and `quality: null`, and every record carries its `source` (`zip`, `ftp` or `snapshot`) and `station`.

The gap check fails when the first recent date after the history's end isn't the next day. Recent days with all-blank values still count as coverage.

## Tests and trying things out

- Fixtures in `test/fixtures/` are real files, kept byte for byte (they're in `.prettierignore`): the October and November 2026 Observatory Hill daily files, and IDN60920, IDN11060 and IDN60910.94768 from 2:30pm on 2026-10-30, trimmed to the Sydney stations and areas plus Canberra.
- Helpers build made-up files in the real formats: `test/daily-file.ts` (`dailyFile`, and `FakeFtp` for the FTP tests) and `test/live-feeds.ts` (`readingsJson`, and the `.tgz` around it). The history tests build fixture ZIPs in a temp directory from inline CSV text.
- Some tests read `data/raw/` and `data/ftp-history/` directly, including the selection snapshot tests, so refreshing the ZIPs can change them. Review the change before updating them with `npx vitest run -u`.
- `npm run smoke:daily-files [location-id]` fetches and prints the current month's daily file. `npm run smoke:live` downloads the three live feeds and prints what each location would save, without saving anything. The facts scripts are listed in [facts.md](facts.md).
