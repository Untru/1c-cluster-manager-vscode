import type { RacRecord, ResourceType } from "./model";

const RESOURCE_LABELS: Record<ResourceType, string> = {
  infobases: "Информационные базы",
  sessions: "Сеансы",
  connections: "Соединения",
  locks: "Блокировки",
  servers: "Рабочие серверы",
  processes: "Рабочие процессы",
  managers: "Менеджеры кластера",
  services: "Сервисы кластера",
  rules: "Требования назначения функциональности",
  profiles: "Профили безопасности",
  counters: "Счётчики потребления ресурсов",
  limits: "Ограничения потребления ресурсов",
  "service-settings": "Настройки сервисов",
  "binary-data-storages": "Хранилища двоичных данных",
};

export function resourceLabel(resource: ResourceType): string {
  return RESOURCE_LABELS[resource];
}

export function recordId(resource: ResourceType, record: RacRecord): string {
  const key: Record<ResourceType, string> = {
    infobases: "infobase",
    sessions: "session",
    connections: "connection",
    locks: "lock",
    servers: "server",
    processes: "process",
    managers: "manager",
    services: "service",
    rules: "rule",
    profiles: "profile",
    counters: "counter",
    limits: "limit",
    "service-settings": "service-setting",
    "binary-data-storages": "binary-data-storage",
  };
  return record[key[resource]] ?? Object.values(record)[0] ?? "unknown";
}

export function recordLabel(resource: ResourceType, record: RacRecord): string {
  switch (resource) {
    case "infobases": return record.name || record.infobase || "Информационная база";
    case "sessions": return [record["user-name"] || "без пользователя", record["app-id"]].filter(Boolean).join(" · ");
    case "connections": return [record.application || "соединение", record.host].filter(Boolean).join(" · ");
    case "locks": return [record.object || record.type || "блокировка", record["locked-by"]].filter(Boolean).join(" · ");
    case "servers": return record.name || record["agent-host"] || record.server || "Рабочий сервер";
    case "processes": return [record.host || "процесс", record.pid && `PID ${record.pid}`].filter(Boolean).join(" · ");
    case "managers": return [record.host || "менеджер", record.pid && `PID ${record.pid}`].filter(Boolean).join(" · ");
    case "services": return record.name || record.service || "Сервис";
    case "rules": return record.name || record.rule || record.object || "Требование";
    case "profiles": return record.name || record.profile || "Профиль безопасности";
    case "counters": return record.name || record.counter || "Счётчик";
    case "limits": return record.name || record.limit || "Ограничение";
    case "service-settings": return record.service || record.name || record["service-setting"] || "Настройка сервиса";
    case "binary-data-storages": return record.name || record["binary-data-storage"] || "Хранилище двоичных данных";
  }
}

export function recordDescription(resource: ResourceType, record: RacRecord): string {
  switch (resource) {
    case "infobases": return record.descr || "";
    case "sessions": return record["started-at"] || record.session || "";
    case "connections": return record["connected-at"] || record.connection || "";
    case "locks": return record.session || record.connection || "";
    case "servers": return record["agent-port"] ? `${record["agent-host"]}:${record["agent-port"]}` : record.server || "";
    case "processes": return record["is-enable"] || record.process || "";
    case "managers": return record.manager || "";
    case "services": return record.manager || "";
    case "rules": return record.type || record.service || "";
    case "profiles": return record.descr || "";
    case "counters": return record.type || "";
    case "limits": return record.action || "";
    case "service-settings": return record.server || record.cluster || "";
    case "binary-data-storages": return record.infobase || record.type || "";
  }
}
