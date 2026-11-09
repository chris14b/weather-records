import { describe, expect, test } from "vitest";
import { build, type Rolldown } from "vite";

async function builtFiles(): Promise<string[]> {
  const result = await build({
    configFile: "vite.config.ts",
    logLevel: "silent",
    build: { write: false },
  });
  const outputs = (Array.isArray(result) ? result : [result]).filter(
    (output): output is Rolldown.RolldownOutput => "output" in output,
  );
  return outputs.flatMap(({ output }) =>
    output.map((file) =>
      file.type === "chunk"
        ? file.code
        : typeof file.source === "string"
          ? file.source
          : new TextDecoder().decode(file.source),
    ),
  );
}

describe("the site build", () => {
  test("leaves out the development-only sky preview", async () => {
    const files = await builtFiles();

    expect(files.some((file) => file.includes("weather records"))).toBe(true);
    for (const file of files) {
      expect(file).not.toMatch(/sky-preview|Sky preview|sydneyInstant/i);
    }
  });
});
