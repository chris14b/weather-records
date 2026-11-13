import type { Station } from "../shared/locations.ts";
import { addDays, monthsBetween } from "./dates.ts";
import { inContext } from "./errors.ts";
import { type DailyReadings, readingSchema } from "./readings.ts";

type Column = keyof typeof readingSchema;

/** Each saved column, by its DWO column's name without the unit. */
const dwoColumns: Readonly<Record<Column, string>> = {
  temp9am: "9am Temperature",
  relHum9am: "9am relative humidity",
  temp3pm: "3pm Temperature",
  relHum3pm: "3pm relative humidity",
};

const columns = Object.keys(dwoColumns) as Column[];

const fileNamePattern = /^(IDCJDW\d{4})\.(\d{4})(\d{2})\.csv$/;
const numberPattern = /^-?\d+(\.\d+)?$/;

/** Where a month of a station's Daily Weather Observations is, for the user to download by hand. */
export function dwoUrl(product: string, month: string): string {
  const yyyymm = month.replace("-", "");
  return `https://www.bom.gov.au/climate/dwo/${yyyymm}/text/${product}.${yyyymm}.csv`;
}

/** The product and month (YYYY-MM) a DWO CSV is named for, or undefined if it isn't one. */
export function dwoFileMonth(
  fileName: string,
): { product: string; month: string } | undefined {
  const match = fileNamePattern.exec(fileName);
  if (match === null) return undefined;
  const [, product = "", year = "", month = ""] = match;
  return { product, month: `${year}-${month}` };
}

/**
 * Reads the 9am and 3pm temperature and humidity from a month of a station's Daily Weather
 * Observations, as saved from BOM's website. Fails unless the file names the station as the
 * source of its temperature and humidity.
 */
export function parseDwo(
  bytes: Uint8Array,
  fileName: string,
  station: Station,
): DailyReadings[] {
  return inContext(fileName, () => {
    const named = dwoFileMonth(fileName);
    if (named === undefined) {
      throw new Error("expected a name like IDCJDW2124.202611.csv");
    }
    if (named.product !== station.dwo) {
      throw new Error(
        `expected ${station.dwo ?? "no DWO product"} for station ${station.station}, found ${named.product}`,
      );
    }

    const lines = new TextDecoder("latin1").decode(bytes).split(/\r?\n/);
    const headerIndex = lines.findIndex(
      (line) => splitCsvLine(line)[1] === "Date",
    );
    if (headerIndex === -1) throw new Error("found no column headers");

    checkStation(lines.slice(0, headerIndex).join("\n"), station.station);
    const header = splitCsvLine(lines[headerIndex] ?? "");
    const indexes = columnIndexes(header);

    const days: DailyReadings[] = [];
    for (const [offset, line] of lines.slice(headerIndex + 1).entries()) {
      if (line.trim() === "") continue;
      inContext(`line ${String(headerIndex + offset + 2)}`, () => {
        const cells = splitCsvLine(line);
        if (cells.length !== header.length) {
          throw new Error(
            `expected ${String(header.length)} columns, found ${String(cells.length)}`,
          );
        }
        const date = parseDate(cells[1] ?? "");
        const expected = addDays(
          days.at(-1)?.date ?? addDays(`${named.month}-01`, -1),
          1,
        );
        if (date !== expected) {
          throw new Error(`expected ${expected}, found ${date}`);
        }
        days.push({
          date,
          ...Object.fromEntries(
            columns.map((column) => [
              column,
              parseNumber(cells[indexes[column]] ?? ""),
            ]),
          ),
        } as DailyReadings);
      });
    }
    return days;
  });
}

/**
 * Checks the lines above the column headers credit the station with the temperature and
 * humidity. A file that takes its other observations elsewhere, such as Sydney's wind from
 * Fort Denison, says which station each kind comes from.
 */
function checkStation(preamble: string, expected: string): void {
  const sources = [...preamble.matchAll(/([^{}\n]*)\{station (\d{6})\}/g)].map(
    ([, text = "", station = ""]) => ({ text, station }),
  );
  const stations = new Set(sources.map(({ station }) => station));
  if (stations.size === 0) throw new Error("names no station");
  if (stations.size === 1) {
    if (!stations.has(expected)) {
      throw new Error(
        `expected station ${expected}, found ${[...stations].join("")}`,
      );
    }
    return;
  }
  for (const kind of ["temperature", "humidity"]) {
    const credited = sources.filter(({ text }) =>
      text.toLowerCase().includes(kind),
    );
    if (credited.length === 0) {
      throw new Error(
        `names stations ${[...stations].join(", ")}, but not which one has the ${kind}`,
      );
    }
    const other = credited.find(({ station }) => station !== expected);
    if (other !== undefined) {
      throw new Error(
        `expected the ${kind} from station ${expected}, found ${other.station}`,
      );
    }
  }
}

function columnIndexes(header: readonly string[]): Record<Column, number> {
  const names = header.map((name) => name.replace(/\s*\([^)]*\)\s*$/, ""));
  return Object.fromEntries(
    columns.map((column) => {
      const indexes = names.flatMap((name, index) =>
        name === dwoColumns[column] ? [index] : [],
      );
      if (indexes.length !== 1) {
        throw new Error(
          `expected one "${dwoColumns[column]}" column, found ${String(indexes.length)}`,
        );
      }
      return [column, indexes[0]];
    }),
  ) as Record<Column, number>;
}

function parseDate(cell: string): string {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(cell);
  if (match === null) throw new Error(`invalid date ${JSON.stringify(cell)}`);
  const [, year = "", month = "", day = ""] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function parseNumber(cell: string): number | null {
  const value = cell.trim();
  if (value === "") return null;
  if (!numberPattern.test(value)) {
    throw new Error(`invalid value ${JSON.stringify(cell)}`);
  }
  return Number(value);
}

/** Splits one line of CSV into its cells, unquoting any quoted cell. */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line.charAt(index);
    if (quoted) {
      if (char === '"' && line.charAt(index + 1) === '"') {
        cell += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells;
}

/**
 * How far a DWO value may be from a saved one. The DWO's humidity is worked out from the
 * rounded temperature and dew point, so it can be 1% from the feed's.
 */
const tolerances: Readonly<Record<Column, number>> = {
  temp9am: 0,
  relHum9am: 1,
  temp3pm: 0,
  relHum3pm: 1,
};

/**
 * Fills the saved readings' missing values from the Daily Weather Observations, keeping only
 * dates from `keptFrom`. A saved value is never replaced. Fails, listing every disagreement,
 * where both have a value further apart than the column's tolerance.
 */
export function addDwoReadings(
  saved: readonly DailyReadings[],
  dwo: readonly DailyReadings[],
  keptFrom: string,
): DailyReadings[] {
  const merged = new Map(saved.map((row) => [row.date, row]));
  const disagreements: string[] = [];
  for (const row of dwo) {
    if (row.date < keptFrom) continue;
    const old = merged.get(row.date);
    for (const column of columns) {
      const before = old?.[column] ?? null;
      const after = row[column];
      if (
        before !== null &&
        after !== null &&
        Math.abs(before - after) > tolerances[column]
      ) {
        disagreements.push(
          `${row.date} ${column}: saved ${String(before)}, DWO ${String(after)}`,
        );
      }
    }
    merged.set(row.date, {
      date: row.date,
      ...Object.fromEntries(
        columns.map((column) => [column, old?.[column] ?? row[column]]),
      ),
    } as DailyReadings);
  }
  if (disagreements.length > 0) {
    throw new Error(
      `The Daily Weather Observations disagree with the saved readings:\n  ${disagreements.join("\n  ")}`,
    );
  }
  return [...merged.values()]
    .filter(({ date }) => date >= keptFrom)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** The months from `from` to `to` with a day missing any reading, and those days. */
export function missingReadings(
  rows: readonly DailyReadings[],
  from: string,
  to: string,
): Map<string, string[]> {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const missing = new Map<string, string[]>();
  for (const month of monthsBetween(from.slice(0, 7), to.slice(0, 7))) {
    for (
      let date = `${month}-01`;
      date.startsWith(month) && date <= to;
      date = addDays(date, 1)
    ) {
      if (date < from) continue;
      const row = byDate.get(date);
      if (row === undefined || columns.some((column) => row[column] === null)) {
        missing.set(month, [...(missing.get(month) ?? []), date]);
      }
    }
  }
  return missing;
}

export interface DownloadLink {
  month: string;
  url: string;
  /** Days that month still missing a reading. */
  missingDays: number;
  /** Whether the month's file is already in the downloads folder. */
  downloaded: boolean;
}

export interface LocationDownloads {
  name: string;
  links: readonly DownloadLink[];
}

/** A page of links to the DWO files still needed, for the user to click through. */
export function downloadPage(locations: readonly LocationDownloads[]): string {
  const sections = locations.map(({ name, links }) => {
    const items =
      links.length === 0
        ? "<li>Nothing missing.</li>"
        : links
            .map(({ month, url, missingDays, downloaded }) => {
              const days = `${String(missingDays)} ${missingDays === 1 ? "day" : "days"} missing`;
              const note = downloaded ? `${days}, already downloaded` : days;
              return `<li><a href="${escapeHtml(url)}">${monthName(month)}</a> (${note})</li>`;
            })
            .join("\n");
    return `<h2>${escapeHtml(name)}</h2>\n<ul>\n${items}\n</ul>`;
  });
  return `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<title>DWO downloads</title>
<style>
body { font: 16px/1.6 system-ui, sans-serif; margin: 2rem auto; max-width: 40rem; padding: 0 1rem; }
a:visited { color: gray; }
</style>
</head>
<body>
<h1>Daily Weather Observations to download</h1>
<p>Save each file into <code>data/dwo/</code> under its own name, then run <code>npm run import:dwo</code>.</p>
${sections.join("\n")}
</body>
</html>
`;
}

function monthName(month: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
