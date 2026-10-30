import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { isValidDate } from "./dates.ts";

interface ColumnTypes {
  number: number;
  text: string;
}

/** A saved CSV's columns after the date, in order, with the type of each. */
export type Schema = Readonly<Record<string, keyof ColumnTypes>>;

/** One day's row in a saved CSV. Null means missing. */
export type SavedRow<S extends Schema> = { date: string } & {
  -readonly [Column in keyof S]: ColumnTypes[S[Column]] | null;
};

type CellValue = ColumnTypes[keyof ColumnTypes] | null;

const numberPattern = /^-?\d+(\.\d+)?$/;
const textPattern = /^[^,"\r\n]+$/;

/** Reads a saved CSV of one row per date, or no rows if the file doesn't exist. */
export async function readSavedRows<S extends Schema>(
  path: string,
  schema: S,
): Promise<SavedRow<S>[]> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const columns = Object.entries(schema);
  const header = headerFor(schema);
  const [first, ...lines] = text.split("\n");
  if (first !== header) {
    throw new Error(
      `${path} has unexpected column headers.\n  expected: ${header}\n  found:    ${first ?? ""}`,
    );
  }
  const rows: SavedRow<S>[] = [];
  let previousDate = "";
  for (const [index, line] of lines.entries()) {
    if (line === "") continue;
    const rowError = (problem: string) =>
      new Error(`${path} line ${String(index + 2)}: ${problem}`);
    const [date = "", ...cells] = line.split(",");
    if (cells.length !== columns.length) {
      throw rowError(
        `expected ${String(columns.length + 1)} columns, found ${String(cells.length + 1)}`,
      );
    }
    if (!isValidDate(date)) throw rowError(`invalid date ${date}`);
    if (date <= previousDate) {
      throw rowError(`${date} is not after ${previousDate}`);
    }
    previousDate = date;
    const values = cells.map((cell, column) => {
      if (cell === "") return null;
      if (columns[column]?.[1] === "text") return cell;
      if (!numberPattern.test(cell)) throw rowError(`invalid value ${cell}`);
      return Number(cell);
    });
    rows.push(rowFrom(date, schema, values));
  }
  return rows;
}

/** Writes rows in date order, deleting the file when there are none. */
export async function writeSavedRows<S extends Schema>(
  path: string,
  schema: S,
  rows: readonly SavedRow<S>[],
): Promise<void> {
  if (rows.length === 0) {
    await rm(path, { force: true });
    return;
  }
  const columns = Object.keys(schema);
  const cell = (value: CellValue) => {
    if (value === null) return "";
    const text = String(value);
    if (!textPattern.test(text)) {
      throw new Error(`Can't save ${JSON.stringify(text)} in ${path}`);
    }
    return text;
  };
  const lines = [...rows]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) =>
      [
        row.date,
        ...columns.map((column) =>
          cell((row as Record<string, CellValue>)[column] ?? null),
        ),
      ].join(","),
    );
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, [headerFor(schema), ...lines, ""].join("\n"));
}

/**
 * Lays fresh rows over saved ones, cell by cell: a fresh value replaces a saved one, and a
 * missing fresh value leaves the saved one alone.
 */
export function mergeRows<S extends Schema>(
  schema: S,
  saved: readonly SavedRow<S>[],
  fresh: readonly SavedRow<S>[],
): SavedRow<S>[] {
  const columns = Object.keys(schema);
  const merged = new Map<string, SavedRow<S>>(
    saved.map((row) => [row.date, row]),
  );
  for (const row of fresh) {
    const old = merged.get(row.date) as Record<string, CellValue> | undefined;
    const values = columns.map(
      (column) =>
        (row as Record<string, CellValue>)[column] ?? old?.[column] ?? null,
    );
    merged.set(row.date, rowFrom(row.date, schema, values));
  }
  return [...merged.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function rowFrom<S extends Schema>(
  date: string,
  schema: S,
  values: readonly CellValue[],
): SavedRow<S> {
  return {
    date,
    ...Object.fromEntries(
      Object.keys(schema).map((column, index) => [
        column,
        values[index] ?? null,
      ]),
    ),
  } as SavedRow<S>;
}

function headerFor(schema: Schema): string {
  return ["date", ...Object.keys(schema)].join(",");
}
