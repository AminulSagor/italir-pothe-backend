import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import * as readline from "node:readline";
import { createHash } from "node:crypto";

function isHttpSource(source: string) {
  return source.startsWith("http://") || source.startsWith("https://");
}

function normalizeFileSource(source: string) {
  if (source.startsWith("file://")) {
    return new URL(source);
  }

  return source;
}

async function openReadable(source: string): Promise<Readable> {
  if (isHttpSource(source)) {
    const response = await fetch(source, {
      headers: {
        "user-agent": "italir-pothe-important-verbs/1.0",
      },
    });

    if (!response.ok || !response.body) {
      throw new Error(
        `Unable to download source ${source}. HTTP ${response.status}`,
      );
    }

    return Readable.fromWeb(response.body as never);
  }

  const fileSource = normalizeFileSource(source);
  await stat(fileSource);
  return createReadStream(fileSource);
}

export async function* readTextLines(source: string) {
  const rawStream = await openReadable(source);
  const decodedStream = source.toLowerCase().endsWith(".gz")
    ? rawStream.pipe(createGunzip())
    : rawStream;

  const reader = readline.createInterface({
    input: decodedStream,
    crlfDelay: Infinity,
  });

  try {
    for await (const line of reader) {
      yield line;
    }
  } finally {
    reader.close();
    decodedStream.destroy();
  }
}

export function sha256(value: unknown) {
  const serialized =
    typeof value === "string" ? value : JSON.stringify(value ?? null);

  return createHash("sha256").update(serialized).digest("hex");
}

export function normalizeText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

export function uniqueNonEmpty(values: unknown[]) {
  return [
    ...new Set(values.map(normalizeText).filter((value) => value.length > 0)),
  ];
}

export function containsWholeWord(text: string, word: string) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}])${escaped}([^\\p{L}]|$)`, "iu").test(text);
}
