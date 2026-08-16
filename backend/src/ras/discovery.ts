import { access, readdir } from "node:fs/promises";
import path, { delimiter } from "node:path";
import type { RasInstallation } from "./types";

async function exists(filePath: string): Promise<boolean> {
  try { await access(filePath); return true; } catch { return false; }
}

function compareVersionsDescending(left: string, right: string): number {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (b[index] ?? 0) - (a[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export async function discoverRasInstallations(): Promise<RasInstallation[]> {
  const executable = process.platform === "win32" ? "ras.exe" : "ras";
  const found = new Map<string, RasInstallation>();

  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    if (!directory) continue;
    const candidate = path.join(directory.replace(/^"|"$/g, ""), executable);
    if (await exists(candidate)) found.set(path.normalize(candidate).toLowerCase(), { path: candidate, version: "PATH" });
  }

  if (process.platform === "win32") {
    const roots = [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]]
      .filter((value): value is string => Boolean(value))
      .map((value) => path.join(value, "1cv8"));
    for (const root of roots) {
      try {
        for (const entry of await readdir(root, { withFileTypes: true })) {
          if (!entry.isDirectory() || !/^\d+(?:\.\d+)+$/.test(entry.name)) continue;
          const candidate = path.join(root, entry.name, "bin", executable);
          if (await exists(candidate)) found.set(path.normalize(candidate).toLowerCase(), { path: candidate, version: entry.name });
        }
      } catch {
        // A missing installation root is normal.
      }
    }
  }

  return [...found.values()].sort((a, b) => compareVersionsDescending(a.version, b.version));
}

