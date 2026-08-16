const { rmSync } = require("node:fs");
const path = require("node:path");

const target = path.resolve(process.cwd(), "out");
if (path.basename(target) !== "out") throw new Error("Refusing to clean an unexpected directory");
rmSync(target, { recursive: true, force: true });
