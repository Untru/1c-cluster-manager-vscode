import { access, readdir } from "node:fs/promises";
import path from "node:path";
import { delimiter } from "node:path";
import { HttpError } from "../errors";

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
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

export async function discoverRac(explicitPath?: string): Promise<string> {
  if (explicitPath) {
    if (await exists(explicitPath)) return explicitPath;
    throw new HttpError(400, `Configured rac executable does not exist: ${explicitPath}`);
  }

  const executable = process.platform === "win32" ? "rac.exe" : "rac";
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    const candidate = path.join(directory.replace(/^"|"$/g, ""), executable);
    if (await exists(candidate)) return candidate;
  }

  if (process.platform === "win32") {
    const roots = [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]]
      .filter((value): value is string => Boolean(value))
      .map((value) => path.join(value, "1cv8"));
    const candidates: Array<{ version: string; filePath: string }> = [];
    for (const root of roots) {
      try {
        for (const entry of await readdir(root, { withFileTypes: true })) {
          if (!entry.isDirectory() || !/^\d+(?:\.\d+)+$/.test(entry.name)) continue;
          const filePath = path.join(root, entry.name, "bin", executable);
          if (await exists(filePath)) candidates.push({ version: entry.name, filePath });
        }
      } catch {
        // An absent 32-bit or 64-bit installation root is normal.
      }
    }
    candidates.sort((a, b) => compareVersionsDescending(a.version, b.version));
    if (candidates[0]) return candidates[0].filePath;
  }

  throw new HttpError(503, "rac executable was not found; configure racPath for the connection");
}

