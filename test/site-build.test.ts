import { describe, expect, test } from "vitest";
import { build, type Rolldown } from "vite";

interface BuiltFile {
  name: string;
  content: string;
}

async function builtFiles(): Promise<BuiltFile[]> {
  const result = await build({
    configFile: "vite.config.ts",
    logLevel: "silent",
    build: { write: false },
  });
  const outputs = (Array.isArray(result) ? result : [result]).filter(
    (output): output is Rolldown.RolldownOutput => "output" in output,
  );
  return outputs.flatMap(({ output }) =>
    output.map((file) => ({
      name: file.fileName,
      content:
        file.type === "chunk"
          ? file.code
          : typeof file.source === "string"
            ? file.source
            : new TextDecoder().decode(file.source),
    })),
  );
}

describe("the site build", async () => {
  const files = await builtFiles();

  test("leaves out the development-only sky preview", () => {
    expect(
      files.some(({ content }) => content.includes("Sydney Weather Records")),
    ).toBe(true);
    for (const { content } of files) {
      expect(content).not.toMatch(/sky-preview|Sky preview|sydneyInstant/i);
    }
  });

  test("links its scripts and styles under the project site's path", () => {
    const page = files.find(({ name }) => name === "index.html");
    const links = [
      ...(page?.content ?? "").matchAll(/(?:src|href)="([^"]+)"/g),
    ].map(([, link]) => link);

    expect(links).not.toHaveLength(0);
    for (const link of links)
      expect(link).toMatch(/^\/weather-records\/assets\//);
  });
});
