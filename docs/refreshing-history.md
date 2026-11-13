# Refreshing the history ZIPs

The history comes from BOM's Climate Data Online. Those pages block automated access, so download the ZIPs by hand in a browser. Refresh them about once a year, or sooner if the build reports a gap between the history and the recent data.

1. Open each link below in a browser. Each one downloads a ZIP named like `IDCJAC0010_066062_1800.zip`.
2. Replace the matching file in `data/raw/`. The names stay the same between downloads.
3. Run the build. It checks the files and drops the saved copies in `data/recent/` for any dates the new ZIPs cover.

If a link stops working, open the station's page instead and click **All years of data** at the top right. To do that, take this address:

```text
https://www.bom.gov.au/jsp/ncc/cdio/weatherData/av?p_nccObsCode=122&p_display_type=dailyDataFile&p_startYear=&p_c=&p_stn_num=066062
```

and change two values in it:

- `p_nccObsCode`: `122` for max temperature, `123` for min temperature, `136` for rainfall
- `p_stn_num`: the station number

## Observatory Hill, old station (066062, 1858 to August 2020)

- [Max temperature](https://www.bom.gov.au/jsp/ncc/cdio/weatherData/av?p_display_type=dailyZippedDataFile&p_stn_num=066062&p_c=-872996223&p_nccObsCode=122&p_startYear=2020)
- [Min temperature](https://www.bom.gov.au/jsp/ncc/cdio/weatherData/av?p_display_type=dailyZippedDataFile&p_stn_num=066062&p_c=-872996419&p_nccObsCode=123&p_startYear=2020)
- [Rainfall](https://www.bom.gov.au/jsp/ncc/cdio/weatherData/av?p_display_type=dailyZippedDataFile&p_stn_num=066062&p_c=-872999112&p_nccObsCode=136&p_startYear=2020)

This station is closed, so its files will never change. Re-downloading them is optional.

## Observatory Hill, current station (066214, 2017 onwards)

- [Max temperature](https://www.bom.gov.au/jsp/ncc/cdio/weatherData/av?p_display_type=dailyZippedDataFile&p_stn_num=066214&p_c=-877017413&p_nccObsCode=122&p_startYear=2026)
- [Min temperature](https://www.bom.gov.au/jsp/ncc/cdio/weatherData/av?p_display_type=dailyZippedDataFile&p_stn_num=066214&p_c=-877017609&p_nccObsCode=123&p_startYear=2026)
- [Rainfall](https://www.bom.gov.au/jsp/ncc/cdio/weatherData/av?p_display_type=dailyZippedDataFile&p_stn_num=066214&p_c=-877020303&p_nccObsCode=136&p_startYear=2026)

## Sydney Airport (066037)

- [Max temperature](https://www.bom.gov.au/jsp/ncc/cdio/weatherData/av?p_display_type=dailyZippedDataFile&p_stn_num=066037&p_c=-872335728&p_nccObsCode=122&p_startYear=2026)
- [Min temperature](https://www.bom.gov.au/jsp/ncc/cdio/weatherData/av?p_display_type=dailyZippedDataFile&p_stn_num=066037&p_c=-872335924&p_nccObsCode=123&p_startYear=2026)
- [Rainfall](https://www.bom.gov.au/jsp/ncc/cdio/weatherData/av?p_display_type=dailyZippedDataFile&p_stn_num=066037&p_c=-872338617&p_nccObsCode=136&p_startYear=2026)

## Sydney Olympic Park, Archery Centre (066212)

- [Max temperature](https://www.bom.gov.au/jsp/ncc/cdio/weatherData/av?p_display_type=dailyZippedDataFile&p_stn_num=066212&p_c=-876964443&p_nccObsCode=122&p_startYear=2026)
- [Min temperature](https://www.bom.gov.au/jsp/ncc/cdio/weatherData/av?p_display_type=dailyZippedDataFile&p_stn_num=066212&p_c=-876964639&p_nccObsCode=123&p_startYear=2026)
- [Rainfall](https://www.bom.gov.au/jsp/ncc/cdio/weatherData/av?p_display_type=dailyZippedDataFile&p_stn_num=066212&p_c=-876967332&p_nccObsCode=136&p_startYear=2026)

## The 9am and 3pm readings

The runs save each day's 9am and 3pm temperature and humidity from the live feed, so the saved readings start on the day saving began, and a missed run leaves a gap. BOM's Daily Weather Observations (DWO) on its website keep the current month and the 12 before it, so they can fill both. They block automated access too, so download them by hand.

1. Run `npm run import:dwo`. It lists, for each location, every month in the last 13 months with a day missing a reading, and writes `data/dwo/download.html`, a page linking each of those months' CSVs. It prints the page's address.
2. Open the page in a browser and save each file into `data/dwo/` under its own name, such as `IDCJDW2124.202611.csv`. That folder is ignored by git. To save straight there, turn on Chrome's **Ask where to save each file before downloading**, or set its download folder to `data/dwo/` for the time being.
3. Run `npm run import:dwo` again. It checks each file, adds its readings to `data/recent/readings/` wherever a value is missing, and lists what is still missing, on the page too. A day the DWO also leaves blank stays listed, marked as already downloaded once its file is in `data/dwo/`.
4. Pull, since the runs commit `data/recent/` every 2 hours, then commit `data/recent/readings/` and delete the files in `data/dwo/`.

The import fails, changing nothing, if a file names the wrong station for its temperature and humidity, if its columns have changed, or if it disagrees with a saved reading: temperatures must match, and humidity must be within 1%. A saved reading is never replaced.

| Location                  | Product      | Station                                                                                                                         |
| ------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Sydney - Observatory Hill | `IDCJDW2124` | 066214 for temperature and humidity (the file takes its wind from Fort Denison, and its cloud and pressure from Sydney Airport) |
| Sydney Airport            | `IDCJDW2125` | 066037                                                                                                                          |
| Sydney Olympic Park       | `IDCJDW2061` | 066212                                                                                                                          |

A month's CSV is at `https://www.bom.gov.au/climate/dwo/YYYYMM/text/<product>.YYYYMM.csv`.
