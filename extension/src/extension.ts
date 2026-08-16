import * as vscode from "vscode";
import { ApiClient } from "./api";
import { BackendManager } from "./backendManager";
import { registerCommands } from "./commands";
import { SecretRepository } from "./secrets";
import { ClusterTreeProvider } from "./tree";
import { RasTreeProvider } from "./rasTree";
import { registerRasCommands } from "./rasCommands";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const secrets = new SecretRepository(context.secrets);
  const api = new ApiClient(secrets);
  const backend = new BackendManager(context, api, secrets);
  const tree = new ClusterTreeProvider(api);
  const rasTree = new RasTreeProvider(api);

  context.subscriptions.push(backend, vscode.window.registerTreeDataProvider("onecClusters", tree), vscode.window.registerTreeDataProvider("onecRas", rasTree));
  registerCommands(context, api, secrets, tree);
  registerRasCommands(context, api, rasTree);

  try {
    await backend.ensureAvailable();
    tree.refresh();
    rasTree.refresh();
  } catch (error) {
    const action = await vscode.window.showErrorMessage(`1C Cluster Manager: ${(error as Error).message}`, "Настройки");
    if (action === "Настройки") await vscode.commands.executeCommand("workbench.action.openSettings", "onecClusterManager.backend");
  }
}

export function deactivate(): void {}
