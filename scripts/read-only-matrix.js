const { readFileSync, writeFileSync, mkdirSync } = require("node:fs");
const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const configPath = path.resolve(root, process.env.ONEC_MATRIX_CONFIG || ".onec-cluster-manager/visual-connections.json");
const reportPath = path.resolve(root, process.env.ONEC_MATRIX_REPORT || "docs/test-results/read-only-matrix.json");
const resources = ["infobases", "sessions", "connections", "locks", "servers", "processes", "managers", "services", "rules", "profiles", "counters", "limits"];

async function freePort() {
  return new Promise((resolve, reject) => { const server = net.createServer(); server.once("error", reject); server.listen(0, "127.0.0.1", () => { const port = server.address().port; server.close(() => resolve(port)); }); });
}
async function request(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(35_000) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}
async function retry(callback) {
  let error;
  for (let attempt = 0; attempt < 30; attempt += 1) { try { return await callback(); } catch (value) { error = value; await new Promise((resolve) => setTimeout(resolve, 200)); } }
  throw error;
}

(async () => {
  const port = await freePort();
  const backend = spawn(process.execPath, [path.join(root, "backend/out/index.js")], { cwd: root, windowsHide: true, env: { ...process.env, ONEC_CLUSTER_MANAGER_PORT: String(port), ONEC_CLUSTER_MANAGER_CONFIG_FILE: configPath }, stdio: "ignore" });
  const base = `http://127.0.0.1:${port}`;
  try {
    await retry(() => request(`${base}/health`));
    const configured = JSON.parse(readFileSync(configPath, "utf8")).connections;
    const matrix = [];
    for (const connection of configured) {
      const capabilities = await request(`${base}/api/connections/${connection.id}/capabilities`);
      const clusters = await request(`${base}/api/connections/${connection.id}/clusters`);
      const row = { name: connection.name, version: capabilities.version, modes: capabilities.modes, clusters: [] };
      for (const cluster of clusters.records) {
        const item = { id: cluster.cluster, name: cluster.name, resources: {}, details: {} };
        item.details.cluster = (await request(`${base}/api/connections/${connection.id}/clusters/${cluster.cluster}`)).records.length;
        for (const resource of resources) item.resources[resource] = (await request(`${base}/api/connections/${connection.id}/clusters/${cluster.cluster}/${resource}`)).records.length;
        const servers = await request(`${base}/api/connections/${connection.id}/clusters/${cluster.cluster}/servers`);
        const processes = await request(`${base}/api/connections/${connection.id}/clusters/${cluster.cluster}/processes`);
        if (servers.records[0]?.server) item.details.server = (await request(`${base}/api/connections/${connection.id}/clusters/${cluster.cluster}/servers/${servers.records[0].server}`)).records.length;
        if (processes.records[0]?.process) item.details.process = (await request(`${base}/api/connections/${connection.id}/clusters/${cluster.cluster}/processes/${processes.records[0].process}`)).records.length;
        if (capabilities.modes.includes("service-setting")) item.resources["service-settings"] = (await request(`${base}/api/connections/${connection.id}/clusters/${cluster.cluster}/service-settings`)).records.length;
        row.clusters.push(item);
      }
      matrix.push(row);
    }
    const report = { status: "passed", generatedAt: new Date().toISOString(), matrix };
    mkdirSync(path.dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally { backend.kill(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });

