# NSW weather records

A static website that shows obscure weather records for the current and recent weather at seven places in New South Wales, such as "the warmest night of the year so far" or "the 7 days to Sunday are forecast to be the wettest 7 days since 2022".

It is live at <https://chris14b.github.io/weather-records/>.

The locations are Sydney's Observatory Hill, Sydney Airport, Sydney Olympic Park, Norah Head, Newcastle Nobbys, Perisher Valley and Broken Hill Airport. Each is named after its Bureau of Meteorology (BOM) station.

## How it works

There is no server. A GitHub Actions workflow downloads BOM's data feeds every 2 hours from 6:30am to 10:30pm Sydney time, works out the facts, writes them to `facts.json`, and deploys the site and that file to GitHub Pages. The page reads `facts.json` in the browser.

- The history comes from BOM's Climate Data Online ZIPs in `data/raw/`, which are downloaded by hand.
- Recent days come from BOM's FTP feeds, which the workflow saves into `data/recent/` and `data/ftp-history/`.
- The workflow is `.github/workflows/deploy.yml`. It has no schedule of its own: a cron-job.org job starts it ([docs/starting-runs.md](docs/starting-runs.md)).

## Running it locally

You need Node 26 (see `.nvmrc`) and npm.

```bash
npm ci
```

Build `facts.json`. It downloads BOM's live feeds over FTP, so it needs a network connection, and it updates `data/recent/` as the workflow does. Pull before committing those changes, since the workflow commits that data every 2 hours.

```bash
npm run build:data
```

Start the site. It is served at <http://localhost:5173/weather-records/>.

```bash
npm run dev
```

Adding `?sky` to the address opens a panel for trying the sky at any date, time and weather. It is left out of the site build.

`npm run build:site` builds the site into `dist/`.

## Checks

```bash
npm test
npm run typecheck
npm run lint
npm run format:check
```

The workflow runs these on every push to `main`, and not on the scheduled runs.

## Refreshing the history

Refresh the ZIPs in `data/raw/` about once a year, or sooner if the build reports a gap between the history and the recent data. BOM blocks automated downloads, so this is done by hand in a browser. The links and steps are in [docs/refreshing-history.md](docs/refreshing-history.md), which also covers filling gaps in the 9am and 3pm readings and the gusts with `npm run import:dwo`.

## More documentation

- [CLAUDE.md](CLAUDE.md): the decisions the project has settled on, and how work on it is done
- [docs/pipeline.md](docs/pipeline.md): how the pipeline reads and saves each data source
- [docs/facts.md](docs/facts.md): how facts are made, ranked, chosen and worded
- [docs/plan.md](docs/plan.md): the open tasks

## Attribution

The data is © Bureau of Meteorology, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The site credits it in its footer.
