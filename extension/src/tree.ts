import * as vscode from "vscode";
import { ApiClient } from "./api";
import type { BackendConnection, RacRecord, ResourceType } from "./model";
import { RESOURCE_TYPES } from "./model";
import { recordDescription, recordId, recordLabel, resourceLabel } from "./presentation";

export type NodeKind = "connection" | "cluster" | "resource" | "record";

export class ClusterNode extends vscode.TreeItem {
  public constructor(
    public readonly kind: NodeKind,
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly connectionId?: string,
    public readonly clusterId?: string,
    public readonly resource?: ResourceType,
    public readonly record?: RacRecord,
    public readonly infobaseId?: string,
    public readonly serverId?: string,
  ) {
    super(label, collapsibleState);
  }
}

const RESOURCE_ICONS: Record<ResourceType, string> = {
  infobases: "database",
  sessions: "account",
  connections: "plug",
  locks: "lock",
  servers: "server",
  processes: "gear",
  managers: "organization",
  services: "extensions",
  rules: "filter",
  profiles: "shield",
  counters: "dashboard",
  limits: "warning",
  "service-settings": "settings-gear",
  "binary-data-storages": "archive",
};

const RECORD_CONTEXT: Record<ResourceType, string> = {
  infobases: "infobase",
  sessions: "session",
  connections: "racConnection",
  locks: "lock",
  servers: "server",
  processes: "process",
  managers: "manager",
  services: "service",
  rules: "rule",
  profiles: "profile",
  counters: "counter",
  limits: "limit",
  "service-settings": "serviceSetting",
  "binary-data-storages": "binaryDataStorage",
};

const RESOURCE_MODE: Record<ResourceType, string> = {
  infobases: "infobase", sessions: "session", connections: "connection", locks: "lock",
  servers: "server", processes: "process", managers: "manager", services: "service",
  rules: "rule", profiles: "profile", counters: "counter", limits: "limit",
  "service-settings": "service-setting", "binary-data-storages": "binary-data-storage",
};

export class ClusterTreeProvider implements vscode.TreeDataProvider<ClusterNode> {
  private readonly changes = new vscode.EventEmitter<ClusterNode | undefined>();
  public readonly onDidChangeTreeData = this.changes.event;

  public constructor(private readonly api: ApiClient) {}

  public refresh(node?: ClusterNode): void {
    this.changes.fire(node);
  }

  public getTreeItem(element: ClusterNode): vscode.TreeItem {
    return element;
  }

  public async getChildren(element?: ClusterNode): Promise<ClusterNode[]> {
    if (!element) {
      return (await this.api.listConnections()).map((connection) => this.connectionNode(connection));
    }
    if (element.kind === "connection") {
      const response = await this.api.clusters(element.connectionId!);
      return response.records.map((record) => {
        const id = record.cluster;
        const node = new ClusterNode("cluster", record.name || id, vscode.TreeItemCollapsibleState.Collapsed, element.connectionId, id, undefined, record);
        node.description = `${record.host ?? ""}${record.port ? `:${record.port}` : ""}`;
        node.contextValue = "cluster";
        node.iconPath = new vscode.ThemeIcon("type-hierarchy-sub");
        node.tooltip = this.tooltip(record);
        node.command = { command: "onecClusterManager.openClusterDetails", title: "Открыть свойства кластера", arguments: [node] };
        return node;
      });
    }
    if (element.kind === "cluster") {
      const capabilities = await this.api.capabilities(element.connectionId!);
      return RESOURCE_TYPES.filter((resource) => capabilities.modes.includes(RESOURCE_MODE[resource]) && !["rules", "service-settings", "binary-data-storages"].includes(resource)).map((resource) => {
        const node = new ClusterNode("resource", resourceLabel(resource), vscode.TreeItemCollapsibleState.Collapsed, element.connectionId, element.clusterId, resource);
        node.contextValue = `resource.${resource}`;
        node.iconPath = new vscode.ThemeIcon(RESOURCE_ICONS[resource]);
        node.command = { command: "onecClusterManager.openResource", title: `Открыть: ${resourceLabel(resource)}`, arguments: [node] };
        node.tooltip = `Открыть ${resourceLabel(resource).toLocaleLowerCase("ru-RU")} в центральной области; стрелка слева разворачивает дерево`;
        return node;
      });
    }
    if (element.kind === "record" && element.resource === "infobases" && element.record) {
      const infobaseId = recordId("infobases", element.record);
      const capabilities = await this.api.capabilities(element.connectionId!);
      const children: ResourceType[] = ["sessions", "connections", "locks"];
      if (capabilities.modes.includes("binary-data-storage")) children.push("binary-data-storages");
      return children.map((resource) => {
        const node = new ClusterNode("resource", resourceLabel(resource), vscode.TreeItemCollapsibleState.Collapsed, element.connectionId, element.clusterId, resource, undefined, infobaseId);
        node.contextValue = `resource.${resource}`;
        node.iconPath = new vscode.ThemeIcon(RESOURCE_ICONS[resource]);
        node.command = { command: "onecClusterManager.openResource", title: `Открыть: ${resourceLabel(resource)}`, arguments: [node] };
        return node;
      });
    }
    if (element.kind === "record" && element.resource === "servers" && element.record) {
      const serverId = recordId("servers", element.record);
      const capabilities = await this.api.capabilities(element.connectionId!);
      const children: ResourceType[] = ["rules"];
      if (capabilities.modes.includes("service-setting")) children.push("service-settings");
      return children.map((resource) => {
        const node = new ClusterNode("resource", resourceLabel(resource), vscode.TreeItemCollapsibleState.Collapsed, element.connectionId, element.clusterId, resource, undefined, undefined, serverId);
        node.contextValue = `resource.${resource}`;
        node.iconPath = new vscode.ThemeIcon(RESOURCE_ICONS[resource]);
        node.command = { command: "onecClusterManager.openResource", title: `Открыть: ${resourceLabel(resource)}`, arguments: [node] };
        return node;
      });
    }
    if (element.kind === "resource") {
      const filters = { ...(element.infobaseId ? { infobase: element.infobaseId } : {}), ...(element.serverId ? { server: element.serverId } : {}) };
      const response = await this.api.resources(element.connectionId!, element.clusterId!, element.resource!, filters);
      return response.records.map((record) => {
        const collapsible = ["infobases", "servers"].includes(element.resource!) ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None;
        const node = new ClusterNode("record", recordLabel(element.resource!, record), collapsible, element.connectionId, element.clusterId, element.resource, record, element.infobaseId, element.serverId);
        node.id = `${element.connectionId}.${element.clusterId}.${element.resource}.${recordId(element.resource!, record)}`;
        node.description = recordDescription(element.resource!, record);
        node.contextValue = RECORD_CONTEXT[element.resource!];
        node.iconPath = new vscode.ThemeIcon(RESOURCE_ICONS[element.resource!]);
        node.tooltip = this.tooltip(record);
        node.command = { command: "onecClusterManager.openDetails", title: "Показать подробности", arguments: [node] };
        return node;
      });
    }
    return [];
  }

  private connectionNode(connection: BackendConnection): ClusterNode {
    const node = new ClusterNode("connection", connection.name, vscode.TreeItemCollapsibleState.Collapsed, connection.id);
    node.description = `${connection.host}:${connection.port}`;
    node.contextValue = "connection";
    node.iconPath = new vscode.ThemeIcon("remote");
    node.tooltip = `${connection.name}\nRAS: ${connection.host}:${connection.port}${connection.racPath ? `\nrac: ${connection.racPath}` : "\nrac: автоматически"}`;
    return node;
  }

  private tooltip(record: RacRecord): vscode.MarkdownString {
    const markdown = new vscode.MarkdownString();
    markdown.appendCodeblock(Object.entries(record).map(([key, value]) => `${key}: ${value}`).join("\n"));
    return markdown;
  }
}
