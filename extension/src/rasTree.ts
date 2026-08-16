import * as vscode from "vscode";
import { ApiClient } from "./api";
import type { RasApplicationInfo, RasInstallation, RasServiceInfo } from "./model";

export type RasNode =
  | { kind: "group"; label: string; group: "installations" | "applications" | "services" }
  | { kind: "installation"; label: string; installation: RasInstallation }
  | { kind: "application"; label: string; application: RasApplicationInfo }
  | { kind: "service"; label: string; service: RasServiceInfo };

export class RasTreeProvider implements vscode.TreeDataProvider<RasNode> {
  private readonly changed = new vscode.EventEmitter<RasNode | undefined>();
  public readonly onDidChangeTreeData = this.changed.event;

  public constructor(private readonly api: ApiClient) {}

  public refresh(): void { this.changed.fire(undefined); }

  public getTreeItem(node: RasNode): vscode.TreeItem {
    if (node.kind === "group") {
      const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Expanded);
      item.contextValue = "rasGroup";
      item.iconPath = new vscode.ThemeIcon(node.group === "installations" ? "versions" : node.group === "applications" ? "server-process" : "server-environment");
      return item;
    }
    if (node.kind === "installation") {
      const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
      item.description = node.installation.path;
      item.tooltip = node.installation.path;
      item.contextValue = "rasInstallation";
      item.iconPath = new vscode.ThemeIcon("package");
      return item;
    }
    if (node.kind === "application") {
      const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
      item.description = `PID ${node.application.pid} → ${node.application.agentHost}:${node.application.agentPort}`;
      item.tooltip = `${node.application.rasPath}\nЗапущен ${new Date(node.application.startedAt).toLocaleString()}`;
      item.contextValue = "rasApplication";
      item.iconPath = new vscode.ThemeIcon("play-circle", new vscode.ThemeColor("testing.iconPassed"));
      return item;
    }
    const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
    item.description = `${node.service.status} · :${node.service.port}`;
    item.tooltip = `${node.service.displayName}\n${node.service.rasPath}`;
    item.contextValue = `rasService.${node.service.status}`;
    item.iconPath = new vscode.ThemeIcon(node.service.status === "running" ? "pass-filled" : "circle-outline");
    return item;
  }

  public async getChildren(node?: RasNode): Promise<RasNode[]> {
    if (!node) return [
      { kind: "group", group: "installations", label: "Установленные версии" },
      { kind: "group", group: "applications", label: "Запущенные приложением" },
      { kind: "group", group: "services", label: "Службы Windows" },
    ];
    if (node.kind !== "group") return [];
    if (node.group === "installations") return (await this.api.rasInstallations()).map((installation) => ({ kind: "installation", label: `1С ${installation.version}`, installation }));
    if (node.group === "applications") return (await this.api.rasApplications()).map((application) => ({ kind: "application", label: `RAS ${application.version} :${application.port}`, application }));
    return (await this.api.rasServices()).map((service) => ({ kind: "service", label: service.serviceName, service }));
  }
}
