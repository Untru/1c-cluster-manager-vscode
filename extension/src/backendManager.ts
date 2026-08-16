import { fork, type ChildProcess } from "node:child_process";
import * as path from "node:path";
import * as vscode from "vscode";
import { ApiClient } from "./api";
import { SecretRepository } from "./secrets";

export class BackendManager implements vscode.Disposable {
  private process?: ChildProcess;

  public constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly api: ApiClient,
    private readonly secrets: SecretRepository,
  ) {}

  public async ensureAvailable(): Promise<void> {
    try {
      await this.api.health();
      return;
    } catch {
      // Start the bundled backend below when allowed.
    }

    const configuration = vscode.workspace.getConfiguration("onecClusterManager");
    const autoStart = configuration.get<boolean>("backend.autoStart", true);
    const rawUrl = configuration.get<string>("backend.url", "http://127.0.0.1:32145");
    const url = new URL(rawUrl);
    if (!autoStart || !["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
      throw new Error(`Backend is unavailable at ${rawUrl}`);
    }

    await vscode.workspace.fs.createDirectory(this.context.globalStorageUri);
    const entry = path.join(this.context.extensionPath, "backend", "index.js");
    this.process = fork(entry, [], {
      cwd: this.context.extensionPath,
      silent: true,
      env: {
        ...process.env,
        ONEC_CLUSTER_MANAGER_HOST: url.hostname,
        ONEC_CLUSTER_MANAGER_PORT: url.port || "32145",
        ONEC_CLUSTER_MANAGER_CONFIG_FILE: path.join(this.context.globalStorageUri.fsPath, "connections.json"),
        ONEC_CLUSTER_MANAGER_API_TOKEN: await this.secrets.getBackendToken(),
      },
    });
    this.process.stderr?.on("data", (chunk: Buffer) => console.error(`[1C backend] ${chunk.toString("utf8").trimEnd()}`));

    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      try { await this.api.health(); return; } catch { /* retry */ }
    }
    throw new Error("Bundled backend failed to start");
  }

  public dispose(): void {
    if (!this.process) return;
    this.process.send?.({ type: "shutdown" });
    const child = this.process;
    setTimeout(() => { if (child.exitCode === null) child.kill(); }, 1_500).unref();
    this.process = undefined;
  }
}
