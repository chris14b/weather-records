export interface StationPeriod {
  station: string;
  /** First date the station supplies values for; absent for a location's first station. */
  from?: string;
}

export interface Station extends StationPeriod {
  /** The station's official name, as in its ZIP notes and the observations feed's `stn-name`. */
  name: string;
  /** The station's folder of monthly daily files (IDCKWCDEA0) on the BOM FTP server. */
  dailyFolder: string;
  /** The WMO number that names the station's file of recent readings (IDN60910). Only stations still open have one. */
  wmo?: string;
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
        dailyFolder: "sydney_(observatory_hill)",
      },
      {
        station: "066214",
        name: "SYDNEY (OBSERVATORY HILL)",
        dailyFolder: "sydney_(observatory_hill)",
        from: "2020-09-01",
        wmo: "94768",
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
        dailyFolder: "sydney_airport_amo",
        wmo: "94767",
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
        dailyFolder: "sydney_olympic_park_(archery_centre)",
        wmo: "95765",
      },
    ],
  },
];

/** The station a location reports from now: its last. */
export function currentStation(location: Location): Station {
  const station = location.stations.at(-1);
  if (station === undefined) throw new Error(`${location.id} has no stations`);
  return station;
}
