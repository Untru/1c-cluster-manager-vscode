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
        return node;
      });
    }
    if (element.kind === "cluster") {
      return RESOURCE_TYPES.map((resource) => {
        const node = new ClusterNode("resource", resourceLabel(resource), vscode.TreeItemCollapsibleState.Collapsed, element.connectionId, element.clusterId, resource);
        node.contextValue = `resource.${resource}`;
        node.iconPath = new vscode.ThemeIcon(RESOURCE_ICONS[resource]);
        if (resource === "sessions") {
          node.command = { command: "onecClusterManager.openSessions", title: "Открыть список сеансов", arguments: [node] };
          node.tooltip = "Открыть табличный список сеансов; стрелка слева разворачивает дерево";
        }
        if (resource === "locks") {
          node.command = { command: "onecClusterManager.openLocks", title: "Открыть таблицу блокировок", arguments: [node] };
          node.tooltip = "Открыть таблицу блокировок; стрелка слева разворачивает дерево";
        }
        return node;
      });
    }
    if (element.kind === "resource") {
      const response = await this.api.resources(element.connectionId!, element.clusterId!, element.resource!);
      return response.records.map((record) => {
        const node = new ClusterNode("record", recordLabel(element.resource!, record), vscode.TreeItemCollapsibleState.None, element.connectionId, element.clusterId, element.resource, record);
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
