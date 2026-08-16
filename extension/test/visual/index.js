const vscode = require("vscode");

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
  // Keep the real Extension Development Host open for external UI automation and screenshots.
  await new Promise((resolve) => setTimeout(resolve, Number(process.env.ONEC_VISUAL_HOLD_MS || "300000")));
}

module.exports = { run };
