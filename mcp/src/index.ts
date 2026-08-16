#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { BackendClient } from "./client";
import { createMcpServer } from "./server";

const client = new BackendClient({
  baseUrl: process.env.ONEC_CLUSTER_MANAGER_BACKEND_URL ?? "http://127.0.0.1:32145",
  token: process.env.ONEC_CLUSTER_MANAGER_API_TOKEN,
  clusterUser: process.env.ONEC_CLUSTER_MANAGER_CLUSTER_USER,
  clusterPassword: process.env.ONEC_CLUSTER_MANAGER_CLUSTER_PASSWORD,
  infobaseUser: process.env.ONEC_CLUSTER_MANAGER_INFOBASE_USER,
  infobasePassword: process.env.ONEC_CLUSTER_MANAGER_INFOBASE_PASSWORD,
});

serveStdio(() => createMcpServer(client), { onerror: (error) => console.error(error.message) });
