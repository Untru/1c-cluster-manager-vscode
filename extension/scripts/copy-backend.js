const { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } = require("node:fs");
const path = require("node:path");

const source = path.resolve(__dirname, "../../backend/out");
const destination = path.resolve(__dirname, "../backend");
if (!existsSync(source)) {
  throw new Error("Backend is not built. Run the root build command first.");
}
rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });

function copyDirectory(from, to) {
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const sourceEntry = path.join(from, entry.name);
    const destinationEntry = path.join(to, entry.name);
    if (entry.isDirectory()) {
      mkdirSync(destinationEntry, { recursive: true });
      copyDirectory(sourceEntry, destinationEntry);
    } else if (entry.isFile()) {
      copyFileSync(sourceEntry, destinationEntry);
    }
  }
}

copyDirectory(source, destination);
