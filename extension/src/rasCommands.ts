import * as vscode from "vscode";
import { ApiClient } from "./api";
import type { RasInstallation, RasStartInput } from "./model";
import type { RasNode } from "./rasTree";
import { RasTreeProvider } from "./rasTree";

async function portInput(prompt: string, value: string): Promise<number | undefined> {
  const text = await vscode.window.showInputBox({ prompt, value, ignoreFocusOut: true, validateInput: (input) => /^\d+$/.test(input) && Number(input) >= 1 && Number(input) <= 65535 ? undefined : "Введите порт от 1 до 65535" });
  return text === undefined ? undefined : Number(text);
}

async function selectInstallation(api: ApiClient, node?: RasNode): Promise<RasInstallation | undefined> {
  if (node?.kind === "installation") return node.installation;
  const installations = await api.rasInstallations();
  const selected = await vscode.window.showQuickPick(installations.map((installation) => ({ label: `1С ${installation.version}`, description: installation.path, installation })), { placeHolder: "Версия платформы для RAS" });
  return selected?.installation;
}

async function startInput(api: ApiClient, node?: RasNode): Promise<RasStartInput | undefined> {
  const installation = await selectInstallation(api, node);
  if (!installation) return undefined;
  const port = await portInput("Порт RAS", "1545");
  if (!port) return undefined;
  const agentHost = await vscode.window.showInputBox({ prompt: "Хост агента кластера 1С", value: "localhost", ignoreFocusOut: true });
  if (!agentHost?.trim()) return undefined;
  const agentPort = await portInput("Порт агента кластера 1С", "1540");
  if (!agentPort) return undefined;
  const monitorText = await vscode.window.showInputBox({ prompt: "Порт мониторинга RAS (необязательно)", value: "", ignoreFocusOut: true, validateInput: (input) => !input || /^\d+$/.test(input) && Number(input) >= 1 && Number(input) <= 65535 ? undefined : "Введите порт от 1 до 65535" });
  if (monitorText === undefined) return undefined;
  return { rasPath: installation.path, port, agentHost: agentHost.trim(), agentPort, ...(monitorText ? { monitorPort: Number(monitorText) } : {}) };
}

export function registerRasCommands(context: vscode.ExtensionContext, api: ApiClient, tree: RasTreeProvider): void {
  const command = (name: string, handler: (node?: RasNode) => Promise<void> | void): void => {
    context.subscriptions.push(vscode.commands.registerCommand(name, async (node?: RasNode) => {
      try { await handler(node); }
      catch (error) { void vscode.window.showErrorMessage(`1C Cluster Manager: ${(error as Error).message}`); }
    }));
  };

  command("onecClusterManager.rasRefresh", () => tree.refresh());
  command("onecClusterManager.startRasApplication", async (node) => {
    const input = await startInput(api, node);
    if (!input) return;
    await api.startRasApplication(input);
    tree.refresh();
    void vscode.window.showInformationMessage(`RAS запущен на порту ${input.port}`);
  });
  command("onecClusterManager.stopRasApplication", async (node) => {
    if (node?.kind !== "application") return;
    const answer = await vscode.window.showWarningMessage(`Остановить RAS на порту ${node.application.port}?`, { modal: true }, "Остановить");
    if (answer !== "Остановить") return;
    await api.stopRasApplication(node.application.id);
    tree.refresh();
  });
  command("onecClusterManager.installRasService", async (node) => {
    const input = await startInput(api, node);
    if (!input) return;
    const serviceName = await vscode.window.showInputBox({ prompt: "Имя службы Windows", value: `OneC-RAS-${input.port}`, ignoreFocusOut: true });
    if (!serviceName?.trim()) return;
    const answer = await vscode.window.showWarningMessage("Установить и зарегистрировать службу RAS? Для операции нужны права администратора.", { modal: true }, "Установить");
    if (answer !== "Установить") return;
    await api.installRasService({ ...input, serviceName: serviceName.trim(), startType: "auto" });
    tree.refresh();
  });
  command("onecClusterManager.startRasService", async (node) => {
    if (node?.kind !== "service") return;
    await api.rasServiceAction(node.service.serviceName, "start");
    tree.refresh();
  });
  command("onecClusterManager.stopRasService", async (node) => {
    if (node?.kind !== "service") return;
    await api.rasServiceAction(node.service.serviceName, "stop");
    tree.refresh();
  });
  command("onecClusterManager.deleteRasService", async (node) => {
    if (node?.kind !== "service") return;
    const answer = await vscode.window.showWarningMessage(`Удалить службу ${node.service.serviceName}?`, { modal: true }, "Удалить");
    if (answer !== "Удалить") return;
    await api.removeRasService(node.service.serviceName);
    tree.refresh();
  });
}
