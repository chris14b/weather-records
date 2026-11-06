import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "fflate";
import { createTar } from "nanotar";

/** A real feed saved in `test/fixtures/`, trimmed to the Sydney stations or areas. */
export function fixture(name: string): string {
  return readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");
}

/** The saved observations (issued at 2:30pm on 2026-10-30), as if observed at `utc` instead. */
export function observationsAt(utc: string): string {
  return fixture("IDN60920.xml").replaceAll(
    '<period index="0" time-utc="2026-10-30T03:30:00+00:00"',
    `<period index="0" time-utc="${utc}"`,
  );
}

/** A gzipped tar archive holding the given files, like IDN60910.tgz. */
export function readingsArchive(
  files: Readonly<Record<string, string>>,
): Uint8Array {
  return gzipSync(
    createTar(Object.entries(files).map(([name, data]) => ({ name, data }))),
  );
}

/** A half-hourly observation, with fields named as in the feed. Any left out are missing. */
export interface Row {
  local: string;
  air_temp?: number | null;
  rel_hum?: number | null;
  [field: string]: unknown;
}

/** A station's file of recent observations in BOM's JSON format, with only the fields used. */
export function readingsJson(
  wmo: string,
  name: string,
  rows: readonly Row[],
): string {
  return JSON.stringify({
    observations: {
      header: [{ ID: "IDN60910", wmo_id: wmo, name }],
      data: rows.map(({ local, ...fields }) => ({
        wmo: Number(wmo),
        name,
        aifstime_local: local,
        air_temp: null,
        rel_hum: null,
        ...fields,
      })),
    },
  });
}
