import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { build } from "vite";

interface BuiltFile {
  name: string;
  content: string;
}

async function builtFiles(outDir: string): Promise<BuiltFile[]> {
  await build({
    configFile: "vite.config.ts",
    logLevel: "silent",
    build: { outDir, emptyOutDir: true },
  });
  const entries = await readdir(outDir, {
    recursive: true,
    withFileTypes: true,
  });
  return Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        const path = join(entry.parentPath, entry.name);
        return {
          name: path.slice(outDir.length + 1),
          content: await readFile(path, "utf8"),
        };
      }),
  );
}

describe("the site build", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "site-build-"));
  afterAll(() => rm(outDir, { recursive: true, force: true }));
  const files = await builtFiles(outDir);

  test("leaves out the development-only sky preview", () => {
    expect(
      files.some(({ content }) => content.includes("Sydney Weather Records")),
    ).toBe(true);
    for (const { content } of files) {
      expect(content).not.toMatch(/sky-preview|Sky preview|sydneyInstant/i);
    }
  });

  const page = files.find(({ name }) => name === "index.html");
  const links = [
    ...(page?.content ?? "").matchAll(/(?:src|href)="([^"]+)"/g),
  ].flatMap(([, link]) => (link ? [link] : []));

  test("links its scripts and styles under the project site's path", () => {
    const assets = links.filter((link) => /\.(?:js|css)$/.test(link));

    expect(assets).not.toHaveLength(0);
    for (const link of assets)
      expect(link).toMatch(/^\/weather-records\/assets\//);
  });

  test.each(["favicon.svg", "apple-touch-icon.png"])(
    "includes %s and links it under the project site's path",
    (icon) => {
      expect(files.map(({ name }) => name)).toContain(icon);
      expect(links).toContain(`/weather-records/${icon}`);
    },
  );

  test("links nothing outside the project site's path", () => {
    expect(links).not.toHaveLength(0);
    for (const link of links) expect(link).toMatch(/^\/weather-records\//);
  });
});
