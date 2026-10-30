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
