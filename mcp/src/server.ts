import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { BackendClient } from "./client";

const id = z.string().uuid();
const location = { connectionId: id.describe("UUID подключения RAS"), clusterId: id.describe("UUID кластера 1С") };

function result(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

export function createMcpServer(client: BackendClient): McpServer {
  const server = new McpServer(
    { name: "onec-cluster-manager", version: "0.1.0" },
    { instructions: "Сначала получите подключения и кластеры. Перед изменением или удалением информационной базы повторно получите её список и сверяйте UUID. Удаление снимает только регистрацию из кластера и никогда не удаляет физическую базу данных." },
  );

  server.registerTool("connections_list", { description: "Список настроенных подключений к RAS" }, async () => result(await client.listConnections()));
  server.registerTool("clusters_list", { description: "Список кластеров подключения", inputSchema: z.object({ connectionId: location.connectionId }) }, async ({ connectionId }) => result(await client.listClusters(connectionId)));
  server.registerTool("infobases_list", { description: "Список информационных баз кластера", inputSchema: z.object(location) }, async (input) => result(await client.listResource(input.connectionId, input.clusterId, "infobases")));
  server.registerTool("infobase_get", { description: "Полные свойства информационной базы, включая блокировки и режим выдачи лицензий", inputSchema: z.object({ ...location, infobaseId: id }) }, async (input) => result(await client.getInfobase(input.connectionId, input.clusterId, input.infobaseId)));
  server.registerTool("sessions_list", { description: "Список сеансов кластера", inputSchema: z.object(location) }, async (input) => result(await client.listResource(input.connectionId, input.clusterId, "sessions")));
  server.registerTool("locks_list", { description: "Список блокировок кластера", inputSchema: z.object(location) }, async (input) => result(await client.listResource(input.connectionId, input.clusterId, "locks")));

  server.registerTool("infobase_register", {
    description: "Зарегистрировать информационную базу в кластере. createDatabase по умолчанию false: физическая БД не создаётся.",
    inputSchema: z.object({
      ...location,
      name: z.string().min(1).max(100),
      dbms: z.enum(["MSSQLServer", "PostgreSQL", "IBMDB2", "OracleDatabase"]),
      dbServer: z.string().min(1).max(255),
      dbName: z.string().min(1).max(100),
      locale: z.string().min(1).max(50).default("ru_RU"),
      description: z.string().max(500).optional(),
      dbUser: z.string().max(100).optional(),
      dbPassword: z.string().max(255).optional().describe("Пароль СУБД; передавайте только для одноразового локального контура"),
      createDatabase: z.boolean().default(false),
    }),
  }, async ({ connectionId, clusterId, ...input }) => result(await client.registerInfobase(connectionId, clusterId, input)));

  server.registerTool("infobase_controls_set", {
    description: "Управлять блокировкой новых сеансов, регламентных заданий и выдачей лицензий сервером 1С",
    inputSchema: z.object({
      ...location,
      infobaseId: id,
      sessionsDeny: z.boolean().optional(),
      scheduledJobsDeny: z.boolean().optional(),
      licenseDistribution: z.enum(["allow", "deny"]).optional(),
      deniedMessage: z.string().max(500).optional(),
      permissionCode: z.string().max(100).optional(),
    }).refine((value) => value.sessionsDeny !== undefined || value.scheduledJobsDeny !== undefined || value.licenseDistribution !== undefined || value.deniedMessage !== undefined || value.permissionCode !== undefined, "Укажите хотя бы одну настройку"),
  }, async ({ connectionId, clusterId, infobaseId, ...input }) => result(await client.updateInfobase(connectionId, clusterId, infobaseId, input)));

  server.registerTool("infobase_unregister", {
    description: "Удалить только регистрацию информационной базы из кластера. Физическая база данных не удаляется.",
    inputSchema: z.object({ ...location, infobaseId: id, confirmation: z.literal("UNREGISTER") }),
  }, async ({ connectionId, clusterId, infobaseId }) => result(await client.unregisterInfobase(connectionId, clusterId, infobaseId)));

  server.registerTool("session_terminate", {
    description: "Принудительно завершить сеанс 1С",
    inputSchema: z.object({ ...location, sessionId: id, message: z.string().min(1).max(500).default("Сеанс завершён администратором") }),
  }, async ({ connectionId, clusterId, sessionId, message }) => result(await client.terminateSession(connectionId, clusterId, sessionId, message)));

  return server;
}
