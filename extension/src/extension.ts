import * as vscode from "vscode";
import { ApiClient } from "./api";
import { BackendManager } from "./backendManager";
import { registerCommands } from "./commands";
import { SecretRepository } from "./secrets";
import { ClusterTreeProvider } from "./tree";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const secrets = new SecretRepository(context.secrets);
  const api = new ApiClient(secrets);
  const backend = new BackendManager(context, api, secrets);
  const tree = new ClusterTreeProvider(api);

  context.subscriptions.push(backend, vscode.window.registerTreeDataProvider("puskClusters", tree));
  registerCommands(context, api, secrets, tree);

  try {
    await backend.ensureAvailable();
    tree.refresh();
  } catch (error) {
    const action = await vscode.window.showErrorMessage(`1C Cluster Manager: ${(error as Error).message}`, "Настройки");
    if (action === "Настройки") await vscode.commands.executeCommand("workbench.action.openSettings", "pusk.backend");
  }
}

export function deactivate(): void {}

