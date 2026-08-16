import * as vscode from "vscode";
import { ApiClient } from "./api";
import { recordId } from "./presentation";
import { showInfobaseProperties, showSessions } from "./panels";
import { SecretRepository } from "./secrets";
import { ClusterNode, ClusterTreeProvider } from "./tree";

async function requiredInput(prompt: string, options: vscode.InputBoxOptions = {}): Promise<string | undefined> {
  return vscode.window.showInputBox({ prompt, ignoreFocusOut: true, ...options, validateInput: (value) => value.trim() ? undefined : "Значение обязательно" });
}

async function credentials(prompt: string): Promise<{ user: string; password: string } | undefined> {
  const user = await requiredInput(`${prompt}: имя пользователя`);
  if (user === undefined) return undefined;
  const password = await vscode.window.showInputBox({ prompt: `${prompt}: пароль`, password: true, ignoreFocusOut: true });
  if (password === undefined) return undefined;
  return { user, password };
}

async function confirm(message: string): Promise<boolean> {
  return (await vscode.window.showWarningMessage(message, { modal: true }, "Выполнить")) === "Выполнить";
}

export function registerCommands(
  context: vscode.ExtensionContext,
  api: ApiClient,
  secrets: SecretRepository,
  tree: ClusterTreeProvider,
): void {
  const command = (name: string, handler: (...args: any[]) => unknown): void => {
    context.subscriptions.push(vscode.commands.registerCommand(name, async (...args: unknown[]) => {
      try {
        await handler(...args);
      } catch (error) {
        void vscode.window.showErrorMessage(`1C Cluster Manager: ${(error as Error).message}`);
      }
    }));
  };

  command("onecClusterManager.refresh", () => tree.refresh());

  command("onecClusterManager.addConnection", async () => {
    const name = await requiredInput("Название подключения", { placeHolder: "Локальная 1С 8.3.27" });
    if (name === undefined) return;
    const host = await requiredInput("Хост RAS", { value: "localhost" });
    if (host === undefined) return;
    const portText = await requiredInput("Порт RAS", { value: "1545", validateInput: (value) => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 65535 ? undefined : "Введите порт от 1 до 65535" });
    if (portText === undefined) return;
    const racPath = await vscode.window.showInputBox({ prompt: "Путь к rac.exe (оставьте пустым для автопоиска)", ignoreFocusOut: true });
    if (racPath === undefined) return;
    await api.addConnection({ name, host, port: Number(portText), racPath: racPath || undefined });
    tree.refresh();
  });

  command("onecClusterManager.removeConnection", async (node: ClusterNode) => {
    if (!node?.connectionId || !await confirm(`Удалить подключение «${node.label}»?`)) return;
    await api.removeConnection(node.connectionId);
    tree.refresh();
  });

  command("onecClusterManager.setClusterCredentials", async (node: ClusterNode) => {
    if (!node?.connectionId || !node.clusterId) return;
    const value = await credentials("Администратор кластера");
    if (!value) return;
    await secrets.setCluster(node.connectionId, node.clusterId, value);
    tree.refresh(node);
  });

  command("onecClusterManager.setInfobaseCredentials", async (node: ClusterNode) => {
    if (!node?.connectionId || !node.clusterId || !node.record || !node.resource) return;
    const value = await credentials("Администратор информационной базы");
    if (!value) return;
    await secrets.setInfobase(node.connectionId, node.clusterId, recordId(node.resource, node.record), value);
  });

  command("onecClusterManager.setBackendToken", async () => {
    const token = await vscode.window.showInputBox({ prompt: "Bearer token backend", password: true, ignoreFocusOut: true });
    if (token !== undefined) await secrets.setBackendToken(token);
  });

  command("onecClusterManager.createInfobase", async (node: ClusterNode) => {
    if (!node?.connectionId || !node.clusterId || node.resource !== "infobases") return;
    const name = await requiredInput("Имя новой регистрации информационной базы", { placeHolder: "test_base" });
    if (!name) return;
    const dbmsPick = await vscode.window.showQuickPick(["PostgreSQL", "MSSQLServer", "IBMDB2", "OracleDatabase"], { placeHolder: "СУБД" });
    if (!dbmsPick) return;
    const dbServer = await requiredInput("Сервер СУБД", { value: "localhost" });
    if (!dbServer) return;
    const dbName = await requiredInput("Имя физической базы данных", { value: name });
    if (!dbName) return;
    const locale = await requiredInput("Локаль", { value: "ru_RU" });
    if (!locale) return;
    const answer = await vscode.window.showWarningMessage(`Зарегистрировать «${name}» в кластере? Физическая база данных создаваться не будет.`, { modal: true }, "Зарегистрировать");
    if (answer !== "Зарегистрировать") return;
    await api.createInfobase(node.connectionId, node.clusterId, { name, dbms: dbmsPick, dbServer, dbName, locale, description: "Создано через 1C Cluster Manager", createDatabase: false });
    tree.refresh(node);
  });

  command("onecClusterManager.removeInfobase", async (node: ClusterNode) => {
    if (!node?.connectionId || !node.clusterId || node.resource !== "infobases" || !node.record) return;
    const name = node.record.name || recordId("infobases", node.record);
    const answer = await vscode.window.showWarningMessage(`Удалить из кластера только регистрацию «${name}»? Физическая база данных не удаляется.`, { modal: true }, "Удалить регистрацию");
    if (answer !== "Удалить регистрацию") return;
    await api.removeInfobase(node.connectionId, node.clusterId, recordId("infobases", node.record));
    tree.refresh();
  });

  command("onecClusterManager.openDetails", async (node: ClusterNode) => {
    if (node.resource === "infobases" && node.connectionId && node.clusterId && node.record) {
      await showInfobaseProperties(context, api, tree, node);
      return;
    }
    let record = node.record ?? {};
    const document = await vscode.workspace.openTextDocument({ language: "json", content: `${JSON.stringify(record, null, 2)}\n` });
    await vscode.window.showTextDocument(document, { preview: true });
  });

  command("onecClusterManager.openSessions", async (node: ClusterNode) => {
    await showSessions(context, api, tree, node);
  });

  const runRecordAction = async (node: ClusterNode, action: string, body: Record<string, unknown>, question: string): Promise<void> => {
    if (!node?.connectionId || !node.clusterId || !node.resource || !node.record || !await confirm(question)) return;
    const id = recordId(node.resource, node.record);
    const infobaseId = node.resource === "infobases" ? id : node.record.infobase;
    await api.action(node.connectionId, node.clusterId, node.resource, id, action, body, infobaseId);
    tree.refresh();
    void vscode.window.showInformationMessage("Команда 1С выполнена");
  };

  command("onecClusterManager.terminateSession", async (node: ClusterNode) => {
    const message = await vscode.window.showInputBox({ prompt: "Сообщение пользователю", value: "Сеанс завершён администратором", ignoreFocusOut: true });
    if (message === undefined) return;
    await runRecordAction(node, "terminate", { message }, "Принудительно завершить выбранный сеанс?");
  });
  command("onecClusterManager.interruptSession", (node: ClusterNode) => runRecordAction(node, "interrupt", {}, "Прервать текущий серверный вызов?"));
  command("onecClusterManager.disconnectConnection", (node: ClusterNode) => runRecordAction(node, "disconnect", { processId: node.record?.process }, "Разорвать выбранное соединение?"));
  command("onecClusterManager.turnOffProcess", (node: ClusterNode) => runRecordAction(node, "turn-off", {}, "Выключить выбранный рабочий процесс?"));
  command("onecClusterManager.enableSessionLock", (node: ClusterNode) => runRecordAction(node, "settings", { sessionsDeny: true }, "Заблокировать начало новых сеансов?"));
  command("onecClusterManager.disableSessionLock", (node: ClusterNode) => runRecordAction(node, "settings", { sessionsDeny: false }, "Разрешить начало новых сеансов?"));
  command("onecClusterManager.enableScheduledJobsLock", (node: ClusterNode) => runRecordAction(node, "settings", { scheduledJobsDeny: true }, "Заблокировать регламентные задания?"));
  command("onecClusterManager.disableScheduledJobsLock", (node: ClusterNode) => runRecordAction(node, "settings", { scheduledJobsDeny: false }, "Разрешить регламентные задания?"));
  command("onecClusterManager.denyLicenseDistribution", (node: ClusterNode) => runRecordAction(node, "settings", { licenseDistribution: "deny" }, "Запретить выдачу лицензий сервером 1С для этой базы?"));
  command("onecClusterManager.allowLicenseDistribution", (node: ClusterNode) => runRecordAction(node, "settings", { licenseDistribution: "allow" }, "Разрешить выдачу лицензий сервером 1С для этой базы?"));
}
