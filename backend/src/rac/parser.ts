import type { RacRecord } from "../types";

function unquote(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return value;
}

export function parseRacOutput(output: string): RacRecord[] {
  const records: RacRecord[] = [];
  let current: RacRecord = {};

  const flush = (): void => {
    if (Object.keys(current).length > 0) {
      records.push(current);
      current = {};
    }
  };

  for (const sourceLine of output.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = sourceLine.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }

    const separator = line.indexOf(":");
    if (separator < 0) {
      const previousKey = Object.keys(current).at(-1);
      if (previousKey) {
        current[previousKey] = `${current[previousKey]}\n${line.trim()}`;
      }
      continue;
    }

    const key = line.slice(0, separator).trim();
    const value = unquote(line.slice(separator + 1).trim());
    if (key) {
      current[key] = value;
    }
  }
  flush();
  return records;
}

