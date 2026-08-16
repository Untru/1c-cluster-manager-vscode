export interface RacCapabilities {
  executable: string;
  version?: string;
  modes: string[];
}

const KNOWN_MODES = [
  "agent", "cluster", "manager", "server", "process", "service", "infobase",
  "connection", "session", "lock", "rule", "profile", "counter", "limit",
  "service-setting", "binary-data-storage",
] as const;

export function parseRacCapabilities(executable: string, help: string): RacCapabilities {
  const modes = KNOWN_MODES.filter((mode) => new RegExp(`(^|\\s)${mode.replaceAll("-", "\\-")}(?=\\s|$)`, "mi").test(help));
  const version = executable.match(/[\\/]((?:\d+\.){2,3}\d+)[\\/]bin[\\/]rac(?:\.exe)?$/i)?.[1]
    ?? help.match(/\b(\d+\.\d+\.\d+\.\d+)\b/)?.[1];
  return { executable, version, modes: [...modes] };
}

