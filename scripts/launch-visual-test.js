const path = require("node:path");
const { runTests } = require("@vscode/test-electron");

const root = path.resolve(__dirname, "..");
runTests({
  extensionDevelopmentPath: path.join(root, "extension"),
  extensionTestsPath: path.join(root, "extension", "test", "visual", "index.js"),
  launchArgs: [root, "--disable-workspace-trust", "--force-renderer-accessibility"],
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
