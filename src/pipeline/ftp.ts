import { Writable } from "node:stream";
import { setTimeout } from "node:timers/promises";
import { Client, FTPError } from "basic-ftp";

const host = "ftp.bom.gov.au";
const fileNotFound = 550;

export interface Ftp {
  /** Downloads a file, or returns undefined when the server says it doesn't exist. */
  download(path: string): Promise<Uint8Array | undefined>;
  close(): void;
}

export interface FtpOptions {
  timeoutMs?: number;
  attempts?: number;
  retryDelayMs?: number;
}

/** An anonymous connection to the BOM FTP server, opened on first use and reopened after a failure. */
export function connectToBom({
  timeoutMs = 30_000,
  attempts = 3,
  retryDelayMs = 5_000,
}: FtpOptions = {}): Ftp {
  const client = new Client(timeoutMs);
  let connected = false;

  async function downloadOnce(path: string): Promise<Uint8Array> {
    if (!connected) {
      await client.access({ host });
      connected = true;
    }
    const chunks: Buffer[] = [];
    const sink = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        chunks.push(chunk);
        callback();
      },
    });
    await client.downloadTo(sink, path);
    return Buffer.concat(chunks);
  }

  return {
    async download(path) {
      for (let attempt = 1; ; attempt++) {
        try {
          return await downloadOnce(path);
        } catch (error) {
          if (error instanceof FTPError && error.code === fileNotFound) {
            return undefined;
          }
          if (attempt >= attempts) {
            throw new Error(
              `Downloading ftp://${host}${path} failed after ${String(attempts)} attempts`,
              { cause: error },
            );
          }
          client.close();
          connected = false;
          await setTimeout(retryDelayMs * attempt);
        }
      }
    },
    close() {
      client.close();
    },
  };
}
