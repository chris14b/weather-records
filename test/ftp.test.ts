import { describe, expect, test } from "vitest";
import { type Ftp, withDownloadCache } from "../src/pipeline/ftp.ts";

describe("withDownloadCache", () => {
  test("downloads each file once, including one that doesn't exist", async () => {
    const requested: string[] = [];
    const ftp: Ftp = {
      download: (path) => {
        requested.push(path);
        return Promise.resolve(path === "/a" ? new Uint8Array([1]) : undefined);
      },
      close: () => undefined,
    };
    const cached = withDownloadCache(ftp);

    const results = [
      await cached.download("/a"),
      await cached.download("/b"),
      await cached.download("/a"),
      await cached.download("/b"),
    ];

    expect(requested).toEqual(["/a", "/b"]);
    expect(results).toEqual([
      new Uint8Array([1]),
      undefined,
      new Uint8Array([1]),
      undefined,
    ]);
  });
});
