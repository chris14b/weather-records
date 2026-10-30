/** Runs `parse`, prefixing any error it throws with `context`, such as the file's name. */
export function inContext<T>(context: string, parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${context}: ${message}`, { cause: error });
  }
}
