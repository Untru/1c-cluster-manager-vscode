const { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { spawn, spawnSync } = require("node:child_process");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const containerName = `onec-cluster-manager-e2e-${process.pid}-${timestamp}`;
const infobaseName = `codex_e2e_${timestamp}`;
const work = mkdtempSync(path.join(os.tmpdir(), "onec-cluster-manager-e2e-"));
const reportPathArg = process.argv.find((value) => value.startsWith("--report="));
const reportPath = reportPathArg ? path.resolve(root, reportPathArg.slice(9)) : undefined;
let backend;
let containerCreated = false;
let apiBaseUrl;
let cleanupResourceRoot;
let cleanupInfobaseId;
let registrationRemoved = false;
const report = { startedAt: new Date().toISOString(), containerName, infobaseName, phases: [] };

function docker(args, allowFailure = false) {
  const result = spawnSync("docker", args, { encoding: "utf8", windowsHide: true });
  if (!allowFailure && result.status !== 0) throw new Error((result.stderr || result.stdout || `docker ${args[0]} failed`).trim());
  return result;
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function request(baseUrl, apiPath, options = {}) {
  const response = await fetch(`${baseUrl}${apiPath}`, { ...options, headers: { accept: "application/json", ...(options.body ? { "content-type": "application/json" } : {}), ...options.headers } });
  const payload = response.status === 204 ? {} : await response.json();
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

async function waitUntil(callback, attempts = 40, delay = 250) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { return await callback(); } catch (error) { lastError = error; await new Promise((resolve) => setTimeout(resolve, delay)); }
  }
  throw lastError;
}

function assertState(record, expected) {
  for (const [key, value] of Object.entries(expected)) if (record[key] !== value) throw new Error(`Expected ${key}=${value}, received ${record[key]}`);
}

async function main() {
  const backendPort = await freePort();
  const inspect = docker(["inspect", containerName], true);
  if (inspect.status === 0) throw new Error(`Refusing to reuse existing container ${containerName}`);

  docker(["run", "--name", containerName, "-e", "PGDATA=/var/lib/pgpro/1c-17/data", "-p", "127.0.0.1::5432", "-d", "akocur/postgresql-1c-17:1"]);
  containerCreated = true;
  await waitUntil(() => {
    const ready = docker(["exec", containerName, "/opt/pgpro/1c-17/bin/pg_isready", "-U", "postgres"], true);
    if (ready.status !== 0) throw new Error("Postgres Pro 1C is not ready");
    return true;
  });
  docker(["exec", containerName, "/opt/pgpro/1c-17/bin/psql", "-U", "postgres", "-d", "postgres", "-c", "ALTER USER postgres PASSWORD 'CodexE2E_2026_only';"]);
  const portOutput = docker(["port", containerName, "5432/tcp"]).stdout.trim();
  const databasePort = Number(portOutput.match(/:(\d+)$/m)?.[1]);
  if (!databasePort) throw new Error(`Cannot parse Docker port: ${portOutput}`);

  const backendEntry = path.join(root, "backend", "out", "index.js");
  if (!existsSync(backendEntry)) throw new Error("Backend is not built; run npm run build first");
  backend = spawn(process.execPath, [backendEntry], {
    cwd: root,
    windowsHide: true,
    stdio: ["ignore", "ignore", "pipe"],
    env: { ...process.env, ONEC_CLUSTER_MANAGER_HOST: "127.0.0.1", ONEC_CLUSTER_MANAGER_PORT: String(backendPort), ONEC_CLUSTER_MANAGER_CONFIG_FILE: path.join(work, "connections.json") },
  });
  const baseUrl = `http://127.0.0.1:${backendPort}`;
  apiBaseUrl = baseUrl;
  await waitUntil(() => request(baseUrl, "/health"));

  const connection = await request(baseUrl, "/api/connections", { method: "POST", body: JSON.stringify({
    name: "Isolated E2E",
    host: process.env.ONEC_E2E_RAS_HOST || "localhost",
    port: Number(process.env.ONEC_E2E_RAS_PORT || "2545"),
    ...(process.env.ONEC_E2E_RAC_PATH ? { racPath: process.env.ONEC_E2E_RAC_PATH } : {}),
  }) });
  const clusters = await request(baseUrl, `/api/connections/${connection.id}/clusters`);
  const clusterId = clusters.records[0]?.cluster;
  if (!clusterId) throw new Error("No cluster found on the E2E RAS connection");
  const resourceRoot = `/api/connections/${connection.id}/clusters/${clusterId}`;
  cleanupResourceRoot = resourceRoot;

  await request(baseUrl, `${resourceRoot}/infobases`, { method: "POST", body: JSON.stringify({
    name: infobaseName, dbms: "PostgreSQL", dbServer: `127.0.0.1 port=${databasePort}`, dbName: infobaseName,
    locale: "ru_RU", dbUser: "postgres", dbPassword: "CodexE2E_2026_only", description: "Disposable full-cycle E2E", createDatabase: true,
  }) });
  const infobases = await request(baseUrl, `${resourceRoot}/infobases`);
  const infobaseId = infobases.records.find((item) => item.name === infobaseName)?.infobase;
  if (!infobaseId) throw new Error("Temporary infobase registration was not found");
  cleanupInfobaseId = infobaseId;
  report.phases.push({ phase: "registered", infobaseId });

  const infobaseRoot = `${resourceRoot}/infobases/${infobaseId}`;
  await request(baseUrl, `${infobaseRoot}/settings`, { method: "POST", body: JSON.stringify({ sessionsDeny: true, scheduledJobsDeny: true, licenseDistribution: "deny", deniedMessage: "E2E maintenance", permissionCode: "E2E-ONLY" }) });
  const blocked = (await request(baseUrl, infobaseRoot)).records[0];
  assertState(blocked, { "sessions-deny": "on", "scheduled-jobs-deny": "on", "license-distribution": "deny" });
  report.phases.push({ phase: "blocked", sessionsDeny: "on", scheduledJobsDeny: "on", licenseDistribution: "deny" });

  await request(baseUrl, `${infobaseRoot}/settings`, { method: "POST", body: JSON.stringify({ sessionsDeny: false, scheduledJobsDeny: false, licenseDistribution: "allow" }) });
  const restored = (await request(baseUrl, infobaseRoot)).records[0];
  assertState(restored, { "sessions-deny": "off", "scheduled-jobs-deny": "off", "license-distribution": "allow" });
  report.phases.push({ phase: "restored", sessionsDeny: "off", scheduledJobsDeny: "off", licenseDistribution: "allow" });

  await waitUntil(() => request(baseUrl, infobaseRoot, { method: "DELETE" }), 20, 500);
  const remaining = await request(baseUrl, `${resourceRoot}/infobases`);
  if (remaining.records.some((item) => item.infobase === infobaseId)) throw new Error("Registration still exists after unregister");
  registrationRemoved = true;
  cleanupInfobaseId = undefined;
  const databaseExists = docker(["exec", containerName, "/opt/pgpro/1c-17/bin/psql", "-U", "postgres", "-d", "postgres", "-tAc", `SELECT 1 FROM pg_database WHERE datname='${infobaseName}'`]).stdout.trim() === "1";
  if (!databaseExists) throw new Error("Physical database was unexpectedly removed");
  report.phases.push({ phase: "unregistered", registrationRemoved: true, physicalDatabasePreserved: true });
  report.status = "passed";
}

main().catch((error) => { report.status = "failed"; report.error = error.message; process.exitCode = 1; }).finally(async () => {
  report.finishedAt = new Date().toISOString();
  if (!registrationRemoved && apiBaseUrl && cleanupResourceRoot) {
    try {
      if (!cleanupInfobaseId) {
        const items = await request(apiBaseUrl, `${cleanupResourceRoot}/infobases`);
        cleanupInfobaseId = items.records.find((item) => item.name === infobaseName)?.infobase;
        if (!cleanupInfobaseId) registrationRemoved = true;
      }
      if (cleanupInfobaseId) {
        const cleanupRoot = `${cleanupResourceRoot}/infobases/${cleanupInfobaseId}`;
        await request(apiBaseUrl, `${cleanupRoot}/settings`, { method: "POST", body: JSON.stringify({ sessionsDeny: false, scheduledJobsDeny: false, licenseDistribution: "allow" }) }).catch(() => undefined);
        await waitUntil(() => request(apiBaseUrl, cleanupRoot, { method: "DELETE" }), 20, 500);
        registrationRemoved = true;
        report.failureCleanup = "temporary registration removed";
      }
    } catch (error) {
      report.cleanupError = `Temporary registration may remain; container was preserved: ${error.message}`;
      process.exitCode = 1;
    }
  }
  if (backend) { backend.kill(); await new Promise((resolve) => setTimeout(resolve, 300)); }
  if (containerCreated && (registrationRemoved || !cleanupResourceRoot)) {
    const inspected = docker(["inspect", containerName, "--format", "{{.Name}} {{.Config.Image}}"], true).stdout.trim();
    if (inspected === `/${containerName} akocur/postgresql-1c-17:1`) docker(["rm", "-f", containerName], true);
    else { report.cleanupError = `Refused to remove unexpected container: ${inspected}`; process.exitCode = 1; }
  }
  rmSync(work, { recursive: true, force: true });
  if (reportPath) { mkdirSync(path.dirname(reportPath), { recursive: true }); writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`); }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
});
