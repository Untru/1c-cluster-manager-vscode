const vscode = require("vscode");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

async function run() {
  const configuration = vscode.workspace.getConfiguration("onecClusterManager");
  await configuration.update("backend.url", process.env.ONEC_VISUAL_BACKEND_URL || "http://127.0.0.1:32153", vscode.ConfigurationTarget.Global);
  await configuration.update("backend.autoStart", false, vscode.ConfigurationTarget.Global);
  await vscode.workspace.getConfiguration("window").update("title", "1C Cluster Manager — Visual E2E", vscode.ConfigurationTarget.Global);
  await vscode.commands.executeCommand("workbench.view.extension.onecClusterManager");
  await vscode.commands.executeCommand("workbench.action.closeAuxiliaryBar");
  await new Promise((resolve) => setTimeout(resolve, 1500));
  await vscode.commands.executeCommand("onecClusterManager.refresh");
  await vscode.commands.executeCommand("onecClusters.focus");
  const captureDirectory = process.env.ONEC_VISUAL_CAPTURE_DIR;
  if (captureDirectory) {
    const capture = async (name) => {
      await new Promise((resolve) => setTimeout(resolve, 900));
      const script = path.resolve(__dirname, "../../../scripts/capture-vscode-window.ps1");
      const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-OutputPath", path.join(captureDirectory, name), "-AncestorPid", String(process.pid)], { encoding: "utf8", windowsHide: true });
      if (result.status !== 0) throw new Error(result.stderr || result.stdout || `Screenshot ${name} failed`);
    };
    for (const [resource, scoped, name] of [
      ["infobases", false, "vscode-infobases.png"], ["sessions", false, "vscode-sessions.png"],
      ["connections", false, "vscode-connections.png"], ["locks", false, "vscode-locks.png"],
    ]) {
      await vscode.commands.executeCommand("onecClusterManager.test.openResource", resource, scoped);
      await capture(name);
    }
    for (const [resource, name] of [["processes", "vscode-process.png"], ["servers", "vscode-server.png"], ["infobases", "vscode-infobase-properties.png"]]) {
      await vscode.commands.executeCommand("onecClusterManager.test.openRecord", resource);
      await capture(name);
    }
    return;
  }
  // Keep the real Extension Development Host open for manual inspection.
  await new Promise((resolve) => setTimeout(resolve, Number(process.env.ONEC_VISUAL_HOLD_MS || "300000")));
}

module.exports = { run };
