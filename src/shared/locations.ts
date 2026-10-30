export interface StationPeriod {
  station: string;
  /** First date the station supplies values for; absent for a location's first station. */
  from?: string;
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
  stations: readonly StationPeriod[];
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
      { station: "066062" },
      { station: "066214", from: "2020-09-01" },
    ],
  },
  {
    id: "sydney-airport",
    name: "Sydney Airport",
    forecastArea: { aac: "NSW_PT272", description: "Mascot" },
    latitude: -33.9465,
    longitude: 151.1731,
    stations: [{ station: "066037" }],
  },
  {
    id: "sydney-olympic-park",
    name: "Sydney Olympic Park",
    forecastArea: { aac: "NSW_PT132", description: "Sydney Olympic Park" },
    latitude: -33.8338,
    longitude: 151.0718,
    stations: [{ station: "066212" }],
  },
];
