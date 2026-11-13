export interface StationPeriod {
  station: string;
  /** First date the station supplies values for; absent for a location's first station. */
  from?: string;
}

/** Months as YYYY-MM, inclusive. */
export interface MonthRange {
  from: string;
  to: string;
}

export interface DailyFolder {
  /** As in BOM's folder listing, under `IDCKWCDEA0/tables/nsw/`. */
  name: string;
  /** The month of its first file, as YYYY-MM. */
  from: string;
  /** Months it has no file for. */
  missing?: readonly MonthRange[];
}

export interface Station extends StationPeriod {
  /** The station's official name, as in its ZIP notes and the observations feed's `stn-name`. */
  name: string;
  /** The station's folder of monthly daily files (IDCKWCDEA0) on the BOM FTP server. */
  dailyFolder: DailyFolder;
  /** The WMO number that names the station's file of recent readings (IDN60910). Only stations still open have one. */
  wmo?: string;
  /** The product code of the station's Daily Weather Observations, which BOM's website keeps for 13 months. Only stations still open have one. */
  dwo?: string;
  /** How much higher it reads than the station before it, in °C. */
  reads?: StationReadings;
}

export interface StationReadings {
  maxTemp: number;
  minTemp: number;
}

/** How much higher than a location's first station its stations read from a date on. */
export interface StationOffset extends StationReadings {
  from: string;
}

/** An `<area>` of type `location` in the BOM 7-day town forecast. */
export interface ForecastArea {
  aac: string;
  description: string;
}

export interface Location {
  id: string;
  /** The current station's `description` in the BOM observations feed. */
  name: string;
  forecastArea: ForecastArea;
  latitude: number;
  longitude: number;
  /** In date order. Each station supplies values until the next one's `from` date. */
  stations: readonly Station[];
}

// Both Observatory Hill stations' values are in one folder.
const observatoryHillFolder: DailyFolder = {
  name: "sydney_(observatory_hill)",
  from: "2009-01",
  missing: [{ from: "2018-04", to: "2020-07" }],
};

// Coordinates are the current station's, from the BOM observations feed (IDN60920).
export const locations: readonly Location[] = [
  {
    id: "sydney-observatory-hill",
    name: "Sydney - Observatory Hill",
    forecastArea: { aac: "NSW_PT131", description: "Sydney" },
    latitude: -33.8593,
    longitude: 151.2048,
    stations: [
      {
        station: "066062",
        name: "SYDNEY (OBSERVATORY HILL)",
        dailyFolder: observatoryHillFolder,
      },
      {
        station: "066214",
        name: "SYDNEY (OBSERVATORY HILL)",
        dailyFolder: observatoryHillFolder,
        from: "2020-09-01",
        wmo: "94768",
        dwo: "IDCJDW2124",
        reads: { maxTemp: 0.3, minTemp: -0.3 },
      },
    ],
  },
  {
    id: "sydney-airport",
    name: "Sydney Airport",
    forecastArea: { aac: "NSW_PT272", description: "Mascot" },
    latitude: -33.9465,
    longitude: 151.1731,
    stations: [
      {
        station: "066037",
        name: "SYDNEY AIRPORT AMO",
        dailyFolder: { name: "sydney_airport_amo", from: "2009-01" },
        wmo: "94767",
        dwo: "IDCJDW2125",
      },
    ],
  },
  {
    id: "sydney-olympic-park",
    name: "Sydney Olympic Park",
    forecastArea: { aac: "NSW_PT132", description: "Sydney Olympic Park" },
    latitude: -33.8338,
    longitude: 151.0718,
    stations: [
      {
        station: "066212",
        name: "SYDNEY OLYMPIC PARK AWS (ARCHERY CENTRE)",
        dailyFolder: {
          name: "sydney_olympic_park_(archery_centre)",
          from: "2011-08",
        },
        wmo: "95765",
        dwo: "IDCJDW2061",
      },
    ],
  },
];

/** The location with this id; throws, listing the ids, if there is none. */
export function locationById(id: string): Location {
  const location = locations.find((l) => l.id === id);
  if (location === undefined) {
    throw new Error(
      `Unknown location ${id}; use one of ${locations.map((l) => l.id).join(", ")}`,
    );
  }
  return location;
}

/** The station a location reports from now: its last. */
export function currentStation(location: Location): Station {
  const station = location.stations.at(-1);
  if (station === undefined) throw new Error(`${location.id} has no stations`);
  return station;
}

/** The offset from each station change on, relative to the location's first station. */
export function stationOffsets(location: Location): StationOffset[] {
  const offsets: StationOffset[] = [];
  for (const { from, reads } of location.stations) {
    if (from === undefined || reads === undefined) continue;
    const before = offsets.at(-1) ?? { maxTemp: 0, minTemp: 0 };
    offsets.push({
      from,
      maxTemp: before.maxTemp + reads.maxTemp,
      minTemp: before.minTemp + reads.minTemp,
    });
  }
  return offsets;
}
