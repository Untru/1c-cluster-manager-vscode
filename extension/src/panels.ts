import { randomBytes } from "node:crypto";
import * as vscode from "vscode";
import { ApiClient } from "./api";
import type { RacRecord, ResourceType } from "./model";
import { recordId } from "./presentation";
import { resourceLabel } from "./presentation";
import type { ClusterNode, ClusterTreeProvider } from "./tree";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function nonce(): string {
  return randomBytes(18).toString("base64");
}

function yes(value: string | undefined): boolean {
  return ["yes", "on", "true", "1", "allow"].includes((value ?? "").toLowerCase());
}

function checked(value: boolean): string {
  return value ? " checked" : "";
}

function baseStyles(): string {
  return `
    *{box-sizing:border-box}body{font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);color:var(--vscode-foreground);background:var(--vscode-editor-background);padding:20px;margin:0}
    h1{font-size:20px;margin:0}.toolbar{display:flex;align-items:center;gap:8px;margin-bottom:20px}.toolbar h1{flex:1}
    button,input,select{font:inherit}button{border:0;padding:7px 14px;color:var(--vscode-button-foreground);background:var(--vscode-button-background);cursor:pointer}button:hover{background:var(--vscode-button-hoverBackground)}button.secondary{color:var(--vscode-foreground);background:var(--vscode-button-secondaryBackground)}
    input,select{width:100%;min-height:30px;padding:5px 8px;color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border,transparent);outline:none}input:focus,select:focus{border-color:var(--vscode-focusBorder)}input[readonly]{opacity:.72}
    label{display:block;font-weight:600;margin-bottom:5px;color:var(--vscode-descriptionForeground)}.hint{font-size:12px;color:var(--vscode-descriptionForeground);font-weight:400}.field{min-width:0}.span-2{grid-column:span 2}.check{display:flex;align-items:center;gap:8px;font-weight:400;color:var(--vscode-foreground)}.check input{width:auto;min-height:auto}
    .empty{padding:36px;text-align:center;color:var(--vscode-descriptionForeground)}
  `;
}

function propertiesHtml(webview: vscode.Webview, record: RacRecord): string {
  const scriptNonce = nonce();
  const value = (key: string): string => escapeHtml(record[key]);
  const dbms = record.dbms || record["dbms"] || "";
  const securityLevel = ({ "0": "Выключено", "1": "Разрешено", "2": "Обязательно" } as Record<string, string>)[record["security-level"]] ?? record["security-level"] ?? "Не задано";
  const licenseAllowed = !["deny", "no", "off"].includes((record["license-distribution"] ?? "allow").toLowerCase());
  return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${scriptNonce}'">
    <style>${baseStyles()}
      form{max-width:1300px;margin:auto}.grid{display:grid;grid-template-columns:repeat(2,minmax(260px,1fr));gap:14px 20px}.grid.three{grid-template-columns:repeat(3,minmax(180px,1fr))}
      fieldset{border:1px solid var(--vscode-panel-border);padding:16px;margin:18px 0}legend{font-weight:600;color:var(--vscode-descriptionForeground)}.actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}
      @media(max-width:760px){.grid,.grid.three{grid-template-columns:1fr}.span-2{grid-column:span 1}}
    </style></head><body><form id="properties">
      <div class="toolbar"><h1>Свойства информационной базы</h1><button class="secondary" id="refresh" type="button">Обновить</button></div>
      <div class="grid">
        <div class="field"><label>Имя</label><input value="${value("name")}" readonly></div>
        <div class="field"><label>Защищённое соединение</label><input value="${escapeHtml(securityLevel)}" readonly></div>
        <div class="field span-2"><label>Описание</label><input name="description" value="${value("descr")}"></div>
        <div class="field"><label>Сервер баз данных</label><input name="dbServer" value="${value("db-server")}"></div>
        <div class="field"><label>Тип СУБД</label><input value="${escapeHtml(dbms)}" readonly></div>
      </div>
      <div class="grid three" style="margin-top:14px">
        <div class="field"><label>База данных</label><input name="dbName" value="${value("db-name")}"></div>
        <div class="field"><label>Пользователь сервера БД</label><input name="dbUser" value="${value("db-user")}"></div>
        <div class="field"><label>Новый пароль пользователя БД <span class="hint">(пусто — не менять)</span></label><input name="dbPassword" type="password" autocomplete="new-password"></div>
      </div>
      <label class="check" style="margin-top:12px"><input name="licenseDistribution" type="checkbox"${checked(licenseAllowed)}>Разрешить выдачу лицензий сервером 1С:Предприятия</label>
      <fieldset><legend>Блокировки и обслуживание</legend>
        <label class="check"><input name="sessionsDeny" type="checkbox"${checked(yes(record["sessions-deny"]))}>Блокировка начала сеансов</label>
        <div class="grid" style="margin-top:12px"><div class="field"><label>Начало</label><input name="deniedFrom" type="datetime-local" value="${value("denied-from")}"></div><div class="field"><label>Окончание</label><input name="deniedTo" type="datetime-local" value="${value("denied-to")}"></div>
        <div class="field span-2"><label>Сообщение</label><input name="deniedMessage" value="${value("denied-message")}"></div><div class="field"><label>Код разрешения</label><input name="permissionCode" value="${value("permission-code")}"></div><div class="field"><label>Параметр блокировки</label><input value="${value("denied-parameter")}" readonly></div></div>
        <label class="check" style="margin-top:12px"><input name="scheduledJobsDeny" type="checkbox"${checked(yes(record["scheduled-jobs-deny"]))}>Блокировка регламентных заданий включена</label>
      </fieldset>
      <div class="field"><label>Внешнее управление сеансами</label><input name="externalSessionManagerConnectionString" value="${value("external-session-manager-connection-string")}"></div>
      <label class="check" style="margin-top:8px"><input name="externalSessionManagerRequired" type="checkbox"${checked(yes(record["external-session-manager-required"]))}>Обязательное использование внешнего управления</label>
      <div class="grid" style="margin-top:14px"><div class="field"><label>Профиль безопасности</label><input name="securityProfileName" value="${value("security-profile-name")}"></div><div class="field"><label>Профиль безопасности безопасного режима</label><input name="safeModeSecurityProfileName" value="${value("safe-mode-security-profile-name")}"></div></div>
      <div class="actions"><button class="secondary" id="reset" type="reset">Отменить изменения</button><button type="submit">Сохранить</button></div>
    </form><script nonce="${scriptNonce}">
      const vscode=acquireVsCodeApi(),form=document.getElementById('properties');
      document.getElementById('refresh').addEventListener('click',()=>vscode.postMessage({command:'refresh'}));
      form.addEventListener('submit',event=>{event.preventDefault();const data=Object.fromEntries(new FormData(form));for(const name of ['sessionsDeny','scheduledJobsDeny','externalSessionManagerRequired'])data[name]=form.elements[name].checked;data.licenseDistribution=form.elements.licenseDistribution.checked?'allow':'deny';vscode.postMessage({command:'save',data});});
    </script></body></html>`;
}

function applicationName(value: string | undefined): string {
  const names: Record<string, string> = { RAS: "Сервер администрирования", "1CV8C": "Тонкий клиент", "1CV8": "Толстый клиент", Designer: "Конфигуратор", BackgroundJob: "Фоновое задание" };
  return names[value ?? ""] ?? value ?? "";
}

function dateTime(value: string | undefined): string {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "medium" }).format(parsed);
}

function sessionsHtml(webview: vscode.Webview, sessions: RacRecord[], bases: RacRecord[], processes: RacRecord[]): string {
  const scriptNonce = nonce();
  const baseNames = new Map(bases.map((base) => [base.infobase, base.name || base.infobase]));
  const processById = new Map(processes.map((process) => [process.process, process]));
  const rows = sessions.map((session) => {
    const process = processById.get(session.process) ?? {};
    return `<tr data-search="${escapeHtml([...Object.values(session), ...Object.values(process), baseNames.get(session.infobase) ?? ""].join(" ").toLowerCase())}">
    <td class="select"><input type="checkbox" value="${escapeHtml(session.session)}"></td><td class="mono">${escapeHtml(session.session)}</td><td>${escapeHtml(session["user-name"])}</td><td>${escapeHtml(baseNames.get(session.infobase) ?? session.infobase)}</td>
    <td>${escapeHtml(session["session-id"])}</td><td>${escapeHtml(dateTime(session["started-at"]))}</td><td>${escapeHtml(dateTime(session["last-active-at"]))}</td><td>${escapeHtml(session.host)}</td><td>${escapeHtml(applicationName(session["app-id"]))}</td>
    <td>${escapeHtml(process.host ?? session.host)}</td><td>${escapeHtml(process.port)}</td><td>${escapeHtml(process.pid)}</td><td class="mono">${escapeHtml(session.connection)}</td><td>${escapeHtml(session["calls-all"])}</td><td>${escapeHtml(session["memory-current"])}</td>
  </tr>`;
  }).join("");
  return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${scriptNonce}'"><style>${baseStyles()}
      body{padding:14px}.toolbar{position:sticky;top:0;background:var(--vscode-editor-background);z-index:2;padding-bottom:10px;margin:0}.search{max-width:520px}.table-wrap{overflow:auto;border:1px solid var(--vscode-panel-border)}table{border-collapse:collapse;min-width:1500px;width:100%}th,td{border-right:1px solid var(--vscode-panel-border);border-bottom:1px solid var(--vscode-panel-border);padding:7px 8px;text-align:left;white-space:nowrap}th{position:sticky;top:0;background:var(--vscode-editor-background);z-index:1}tr:hover td{background:var(--vscode-list-hoverBackground)}.select{width:34px;text-align:center}.select input{width:auto;min-height:auto}.mono{font-family:var(--vscode-editor-font-family)}.count{color:var(--vscode-descriptionForeground)}
    </style></head><body>
      <div class="toolbar"><input id="search" class="search" placeholder="Поиск по сеансам"><span class="count" id="count">${sessions.length} сеанс(ов)</span><button class="secondary" id="export">Экспорт CSV</button><button class="secondary" id="refresh">Обновить</button><button id="terminate">Завершить выбранные</button></div>
      ${sessions.length ? `<div class="table-wrap"><table><thead><tr><th class="select"><input id="all" type="checkbox"></th><th>UUID</th><th>Имя пользователя</th><th>Инфобаза</th><th>Номер</th><th>Время начала</th><th>Последняя активность</th><th>Компьютер</th><th>Приложение</th><th>Сервер</th><th>Порт</th><th>PID</th><th>Соединение</th><th>Вызовы</th><th>Память</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="empty">Активных сеансов нет</div>`}
      <script nonce="${scriptNonce}">const vscode=acquireVsCodeApi(),rows=[...document.querySelectorAll('tbody tr')],search=document.getElementById('search'),count=document.getElementById('count');
        function selected(){return [...document.querySelectorAll('tbody input[type=checkbox]:checked')].map(x=>x.value)}
        search.addEventListener('input',()=>{const q=search.value.trim().toLowerCase();let visible=0;rows.forEach(row=>{const show=!q||row.dataset.search.includes(q);row.hidden=!show;if(show)visible++});count.textContent=visible+' сеанс(ов)'});
        document.getElementById('all')?.addEventListener('change',event=>document.querySelectorAll('tbody input[type=checkbox]').forEach(x=>x.checked=event.target.checked));
        document.getElementById('refresh').addEventListener('click',()=>vscode.postMessage({command:'refresh'}));document.getElementById('export').addEventListener('click',()=>vscode.postMessage({command:'export'}));document.getElementById('terminate').addEventListener('click',()=>vscode.postMessage({command:'terminate',ids:selected()}));
      </script></body></html>`;
}

function locksHtml(
  webview: vscode.Webview,
  locks: RacRecord[],
  bases: RacRecord[],
  sessions: RacRecord[],
  connections: RacRecord[],
  processes: RacRecord[],
): string {
  const scriptNonce = nonce();
  const baseNames = new Map(bases.map((base) => [base.infobase, base.name || base.infobase]));
  const sessionById = new Map(sessions.map((session) => [session.session, session]));
  const connectionById = new Map(connections.map((connection) => [connection.connection, connection]));
  const processById = new Map(processes.map((process) => [process.process, process]));
  const rows = locks.map((lock) => {
    const connection = connectionById.get(lock.connection) ?? {};
    const session = sessionById.get(lock.session) ?? {};
    const process = processById.get(connection.process || session.process) ?? {};
    const infobaseId = connection.infobase || session.infobase || "";
    const search = [
      ...Object.values(lock), ...Object.values(connection), ...Object.values(session), ...Object.values(process), baseNames.get(infobaseId) ?? "",
    ].join(" ").toLowerCase();
    return `<tr data-search="${escapeHtml(search)}"><td>${escapeHtml(lock.descr)}</td><td>${escapeHtml(baseNames.get(infobaseId) ?? (infobaseId === "00000000-0000-0000-0000-000000000000" ? "" : infobaseId))}</td>
      <td>${escapeHtml(connection["conn-id"] || lock.connection)}</td><td>${escapeHtml(session["session-id"] || connection["session-number"] || (lock.session === "00000000-0000-0000-0000-000000000000" ? "" : lock.session))}</td>
      <td>${escapeHtml(connection.host || session.host)}</td><td>${escapeHtml(applicationName(connection.application || session["app-id"]))}</td><td>${escapeHtml(process.host)}</td><td>${escapeHtml(process.port)}</td><td>${escapeHtml(process.pid)}</td><td>${escapeHtml(dateTime(lock.locked))}</td>
      <td class="mono">${escapeHtml(lock.object === "00000000-0000-0000-0000-000000000000" ? "" : lock.object)}</td></tr>`;
  }).join("");
  return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${scriptNonce}'"><style>${baseStyles()}
      body{padding:14px}.toolbar{position:sticky;top:0;background:var(--vscode-editor-background);z-index:2;padding-bottom:10px;margin:0}.search{max-width:620px}.table-wrap{overflow:auto;border:1px solid var(--vscode-panel-border)}table{border-collapse:collapse;min-width:1500px;width:100%}th,td{border-right:1px solid var(--vscode-panel-border);border-bottom:1px solid var(--vscode-panel-border);padding:7px 8px;text-align:left;white-space:nowrap}th{position:sticky;top:0;background:var(--vscode-editor-background);z-index:1}tr:hover td{background:var(--vscode-list-hoverBackground)}.mono{font-family:var(--vscode-editor-font-family)}.count{color:var(--vscode-descriptionForeground)}
    </style></head><body><div class="toolbar"><input id="search" class="search" placeholder="Поиск по блокировкам"><span class="count" id="count">${locks.length} блокировок</span><button class="secondary" id="export">Экспорт CSV</button><button id="refresh">Обновить</button></div>
      ${locks.length ? `<div class="table-wrap"><table><thead><tr><th>Описание</th><th>Инфобаза</th><th>Соединение</th><th>Сеанс</th><th>Компьютер</th><th>Приложение</th><th>Сервер</th><th>Порт</th><th>PID</th><th>Установлена</th><th>Объект</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="empty">Активных блокировок нет</div>`}
      <script nonce="${scriptNonce}">const vscode=acquireVsCodeApi(),rows=[...document.querySelectorAll('tbody tr')],search=document.getElementById('search'),count=document.getElementById('count');search.addEventListener('input',()=>{const q=search.value.trim().toLowerCase();let visible=0;rows.forEach(row=>{const show=!q||row.dataset.search.includes(q);row.hidden=!show;if(show)visible++});count.textContent=visible+' блокировок'});document.getElementById('refresh').addEventListener('click',()=>vscode.postMessage({command:'refresh'}));document.getElementById('export').addEventListener('click',()=>vscode.postMessage({command:'export'}));</script>
    </body></html>`;
}

export async function showInfobaseProperties(
  context: vscode.ExtensionContext,
  api: ApiClient,
  tree: ClusterTreeProvider,
  node: ClusterNode,
): Promise<void> {
  if (!node.connectionId || !node.clusterId || !node.record) return;
  const infobaseId = recordId("infobases", node.record);
  let record = (await api.infobaseDetails(node.connectionId, node.clusterId, infobaseId)).records[0] ?? node.record;
  const panel = vscode.window.createWebviewPanel("onecInfobaseProperties", `1С: ${record.name || node.label}`, vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
  panel.webview.html = propertiesHtml(panel.webview, record);
  context.subscriptions.push(panel);
  const refresh = async (): Promise<void> => {
    record = (await api.infobaseDetails(node.connectionId!, node.clusterId!, infobaseId)).records[0] ?? record;
    panel.webview.html = propertiesHtml(panel.webview, record);
  };
  panel.webview.onDidReceiveMessage(async (message: { command?: string; data?: Record<string, unknown> }) => {
    try {
      if (message.command === "refresh") await refresh();
      if (message.command === "save" && message.data) {
        await api.action(node.connectionId!, node.clusterId!, "infobases", infobaseId, "settings", message.data, infobaseId);
        tree.refresh();
        await refresh();
        void vscode.window.showInformationMessage(`Свойства базы «${record.name || node.label}» сохранены`);
      }
    } catch (error) { void vscode.window.showErrorMessage(`1C Cluster Manager: ${(error as Error).message}`); }
  }, undefined, context.subscriptions);
}

export async function showSessions(
  context: vscode.ExtensionContext,
  api: ApiClient,
  tree: ClusterTreeProvider,
  node: ClusterNode,
): Promise<void> {
  if (!node.connectionId || !node.clusterId) return;
  let sessions: RacRecord[] = [];
  let bases: RacRecord[] = [];
  let processes: RacRecord[] = [];
  const load = async (): Promise<void> => {
    [sessions, bases, processes] = await Promise.all([
      api.resources(node.connectionId!, node.clusterId!, "sessions", node.infobaseId ? { infobase: node.infobaseId } : {}).then((value) => value.records),
      api.resources(node.connectionId!, node.clusterId!, "infobases").then((value) => value.records),
      api.resources(node.connectionId!, node.clusterId!, "processes").then((value) => value.records),
    ]);
  };
  await load();
  const panel = vscode.window.createWebviewPanel("onecSessions", node.infobaseId ? "1С: Сеансы информационной базы" : "1С: Сеансы", vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
  panel.webview.html = sessionsHtml(panel.webview, sessions, bases, processes);
  context.subscriptions.push(panel);
  const refresh = async (): Promise<void> => { await load(); panel.webview.html = sessionsHtml(panel.webview, sessions, bases, processes); tree.refresh(node); };
  panel.webview.onDidReceiveMessage(async (message: { command?: string; ids?: string[] }) => {
    try {
      if (message.command === "refresh") await refresh();
      if (message.command === "terminate") {
        const ids = Array.isArray(message.ids) ? message.ids.filter((id) => typeof id === "string") : [];
        if (!ids.length) { void vscode.window.showInformationMessage("Выберите хотя бы один сеанс"); return; }
        const answer = await vscode.window.showWarningMessage(`Завершить выбранные сеансы (${ids.length})?`, { modal: true }, "Завершить");
        if (answer !== "Завершить") return;
        for (const id of ids) {
          const session = sessions.find((item) => item.session === id);
          if (session) await api.action(node.connectionId!, node.clusterId!, "sessions", id, "terminate", { message: "Сеанс завершён администратором" }, session.infobase);
        }
        await refresh();
      }
      if (message.command === "export") {
        const target = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file(`sessions-${new Date().toISOString().slice(0, 10)}.csv`), filters: { CSV: ["csv"] } });
        if (!target) return;
        const columns = ["session", "user-name", "infobase", "session-id", "started-at", "last-active-at", "host", "app-id", "pid", "connection", "calls-all", "memory-current"];
        const csv = [columns, ...sessions.map((item) => columns.map((column) => item[column] ?? ""))].map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(";")).join("\r\n");
        await vscode.workspace.fs.writeFile(target, Buffer.from(`\uFEFF${csv}`, "utf8"));
      }
    } catch (error) { void vscode.window.showErrorMessage(`1C Cluster Manager: ${(error as Error).message}`); }
  }, undefined, context.subscriptions);
}

export async function showLocks(
  context: vscode.ExtensionContext,
  api: ApiClient,
  tree: ClusterTreeProvider,
  node: ClusterNode,
): Promise<void> {
  if (!node.connectionId || !node.clusterId) return;
  let locks: RacRecord[] = [];
  let bases: RacRecord[] = [];
  let sessions: RacRecord[] = [];
  let connections: RacRecord[] = [];
  let processes: RacRecord[] = [];
  const load = async (): Promise<void> => {
    [locks, bases, sessions, connections, processes] = await Promise.all([
      api.resources(node.connectionId!, node.clusterId!, "locks", node.infobaseId ? { infobase: node.infobaseId } : {}).then((value) => value.records),
      api.resources(node.connectionId!, node.clusterId!, "infobases").then((value) => value.records),
      api.resources(node.connectionId!, node.clusterId!, "sessions").then((value) => value.records),
      api.resources(node.connectionId!, node.clusterId!, "connections").then((value) => value.records),
      api.resources(node.connectionId!, node.clusterId!, "processes").then((value) => value.records),
    ]);
  };
  await load();
  const panel = vscode.window.createWebviewPanel("onecLocks", node.infobaseId ? "1С: Блокировки информационной базы" : "1С: Блокировки", vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
  panel.webview.html = locksHtml(panel.webview, locks, bases, sessions, connections, processes);
  context.subscriptions.push(panel);
  const refresh = async (): Promise<void> => {
    await load();
    panel.webview.html = locksHtml(panel.webview, locks, bases, sessions, connections, processes);
    tree.refresh(node);
  };
  panel.webview.onDidReceiveMessage(async (message: { command?: string; data?: Record<string, unknown> }) => {
    try {
      if (message.command === "refresh") await refresh();
      if (message.command === "export") {
        const target = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file(`locks-${new Date().toISOString().slice(0, 10)}.csv`), filters: { CSV: ["csv"] } });
        if (!target) return;
        const columns = ["descr", "connection", "session", "object", "locked"];
        const csv = [columns, ...locks.map((item) => columns.map((column) => item[column] ?? ""))].map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(";")).join("\r\n");
        await vscode.workspace.fs.writeFile(target, Buffer.from(`\uFEFF${csv}`, "utf8"));
      }
    } catch (error) { void vscode.window.showErrorMessage(`1C Cluster Manager: ${(error as Error).message}`); }
  }, undefined, context.subscriptions);
}

function genericTableHtml(resource: ResourceType, records: RacRecord[]): string {
  const scriptNonce = nonce();
  const columns = [...new Set(records.flatMap((record) => Object.keys(record)))];
  const rows = records.map((record) => `<tr data-search="${escapeHtml(Object.values(record).join(" ").toLowerCase())}">${columns.map((column) => `<td>${escapeHtml(record[column])}</td>`).join("")}</tr>`).join("");
  return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${scriptNonce}'"><style>${baseStyles()}
    body{padding:14px}.toolbar{position:sticky;top:0;z-index:2;background:var(--vscode-editor-background);padding-bottom:10px;margin:0}.toolbar h1{font-size:17px}.search{max-width:620px}.count{color:var(--vscode-descriptionForeground)}.table-wrap{overflow:auto;border:1px solid var(--vscode-panel-border)}table{border-collapse:collapse;min-width:100%;width:max-content}th,td{border-right:1px solid var(--vscode-panel-border);border-bottom:1px solid var(--vscode-panel-border);padding:7px 8px;text-align:left;white-space:nowrap}th{position:sticky;top:0;background:var(--vscode-editor-background)}tr:hover td{background:var(--vscode-list-hoverBackground)}
    </style></head><body><div class="toolbar"><h1>${escapeHtml(resourceLabel(resource))}</h1><input id="search" class="search" placeholder="Поиск"><span id="count" class="count">${records.length} записей</span><button class="secondary" id="export">Экспорт CSV</button><button id="refresh">Обновить</button></div>
    ${records.length ? `<div class="table-wrap"><table><thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="empty">Данных нет</div>`}
    <script nonce="${scriptNonce}">const vscode=acquireVsCodeApi(),rows=[...document.querySelectorAll('tbody tr')],search=document.getElementById('search'),count=document.getElementById('count');search.addEventListener('input',()=>{const q=search.value.trim().toLowerCase();let n=0;rows.forEach(r=>{const show=!q||r.dataset.search.includes(q);r.hidden=!show;if(show)n++});count.textContent=n+' записей'});document.getElementById('refresh').addEventListener('click',()=>vscode.postMessage({command:'refresh'}));document.getElementById('export').addEventListener('click',()=>vscode.postMessage({command:'export'}));</script></body></html>`;
}

function detailsHtml(title: string, record: RacRecord): string {
  const scriptNonce = nonce();
  const fields = Object.entries(record).map(([key, value]) => `<div class="field"><label>${escapeHtml(key)}</label><input readonly value="${escapeHtml(value)}"></div>`).join("");
  return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${scriptNonce}'"><style>${baseStyles()}.grid{display:grid;grid-template-columns:repeat(2,minmax(260px,1fr));gap:14px 20px;max-width:1300px;margin:auto}@media(max-width:760px){.grid{grid-template-columns:1fr}}</style></head><body><div class="toolbar"><h1>${escapeHtml(title)}</h1><button id="refresh">Обновить</button></div><div class="grid">${fields}</div><script nonce="${scriptNonce}">const vscode=acquireVsCodeApi();document.getElementById('refresh').addEventListener('click',()=>vscode.postMessage({command:'refresh'}));</script></body></html>`;
}

function serverHtml(title: string, record: RacRecord): string {
  const scriptNonce = nonce();
  const value = (key: string): string => escapeHtml(record[key]);
  const input = (label: string, name: string, key: string, suffix = "") => `<div class="field"><label>${label}</label><div class="unit"><input name="${name}" value="${value(key)}">${suffix ? `<span>${suffix}</span>` : ""}</div></div>`;
  return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${scriptNonce}'"><style>${baseStyles()}form{max-width:1300px;margin:auto}.grid{display:grid;grid-template-columns:repeat(2,minmax(260px,1fr));gap:14px 20px}.unit{display:flex;align-items:center}.unit span{margin-left:-52px;color:var(--vscode-descriptionForeground);pointer-events:none}.actions{display:flex;justify-content:flex-end;margin-top:18px}@media(max-width:760px){.grid{grid-template-columns:1fr}}</style></head><body><form id="server"><div class="toolbar"><h1>${escapeHtml(title)}</h1><button class="secondary" id="refresh" type="button">Обновить</button></div><div class="grid">
    ${input("Описание сервера", "description", "descr")}<div class="field"><label>Компьютер</label><input readonly value="${value("agent-host") || value("name")}"></div>
    <div class="field"><label>IP порт</label><input readonly value="${value("agent-port")}"></div>${input("Диапазоны IP портов", "portRange", "port-range")}
    ${input("Безопасный расход памяти за один вызов", "safeCallMemoryLimit", "safe-call-memory-limit", "Мб")}${input("Критический объём памяти процессов", "criticalTotalMemory", "critical-total-memory", "Мб")}
    ${input("Временно допустимый объём памяти процессов", "temporaryAllowedTotalMemory", "temporary-allowed-total-memory", "Мб")}${input("Интервал превышения допустимого объёма памяти", "temporaryAllowedTotalMemoryTimeLimit", "temporary-allowed-total-memory-time-limit", "сек")}
    ${input("Количество ИБ на процесс", "infobasesLimit", "infobases-limit")}${input("Количество соединений на процесс", "connectionsLimit", "connections-limit")}
    <label class="check"><input name="dedicatedManagers" type="checkbox"${checked(yes(record["dedicated-managers"]))}>Менеджер под каждый сервис</label><label class="check"><input name="mainServer" type="checkbox"${checked(yes(record["main-server"]))}>Центральный сервер</label>
    </div><div class="actions"><button type="submit">Сохранить</button></div></form><script nonce="${scriptNonce}">const vscode=acquireVsCodeApi(),form=document.getElementById('server');document.getElementById('refresh').addEventListener('click',()=>vscode.postMessage({command:'refresh'}));form.addEventListener('submit',event=>{event.preventDefault();const data=Object.fromEntries(new FormData(form));data.dedicatedManagers=form.elements.dedicatedManagers.checked;data.mainServer=form.elements.mainServer.checked;vscode.postMessage({command:'save',data})});</script></body></html>`;
}

export async function showResourceTable(context: vscode.ExtensionContext, api: ApiClient, tree: ClusterTreeProvider, node: ClusterNode): Promise<void> {
  if (!node.connectionId || !node.clusterId || !node.resource) return;
  if (node.resource === "sessions") return showSessions(context, api, tree, node);
  if (node.resource === "locks") return showLocks(context, api, tree, node);
  let records: RacRecord[] = [];
  const load = async (): Promise<void> => {
    const filters = { ...(node.infobaseId ? { infobase: node.infobaseId } : {}), ...(node.serverId ? { server: node.serverId } : {}) };
    records = (await api.resources(node.connectionId!, node.clusterId!, node.resource!, filters)).records;
  };
  await load();
  const panel = vscode.window.createWebviewPanel("onecResourceTable", `1С: ${resourceLabel(node.resource)}`, vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
  panel.webview.html = genericTableHtml(node.resource, records);
  context.subscriptions.push(panel);
  panel.webview.onDidReceiveMessage(async (message: { command?: string }) => {
    try {
      if (message.command === "refresh") { await load(); panel.webview.html = genericTableHtml(node.resource!, records); tree.refresh(node); }
      if (message.command === "export") {
        const target = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file(`${node.resource}-${new Date().toISOString().slice(0, 10)}.csv`), filters: { CSV: ["csv"] } });
        if (!target) return;
        const columns = [...new Set(records.flatMap((record) => Object.keys(record)))];
        const csv = [columns, ...records.map((item) => columns.map((column) => item[column] ?? ""))].map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(";")).join("\r\n");
        await vscode.workspace.fs.writeFile(target, Buffer.from(`\uFEFF${csv}`, "utf8"));
      }
    } catch (error) { void vscode.window.showErrorMessage(`1C Cluster Manager: ${(error as Error).message}`); }
  }, undefined, context.subscriptions);
}

export async function showRecordDetails(context: vscode.ExtensionContext, api: ApiClient, node: ClusterNode): Promise<void> {
  if (!node.connectionId || !node.clusterId || !node.resource || !node.record) return;
  let record = node.record;
  const load = async (): Promise<void> => {
    if (["locks", "connections", "sessions"].includes(node.resource!)) return;
    record = (await api.resourceDetails(node.connectionId!, node.clusterId!, node.resource!, recordId(node.resource!, node.record!), node.infobaseId)).records[0] ?? record;
  };
  await load();
  const panel = vscode.window.createWebviewPanel("onecRecordDetails", `1С: ${node.label}`, vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
  const render = (): string => node.resource === "servers" ? serverHtml(`Рабочий сервер — ${String(node.label)}`, record) : detailsHtml(String(node.label), record);
  panel.webview.html = render();
  context.subscriptions.push(panel);
  panel.webview.onDidReceiveMessage(async (message: { command?: string; data?: Record<string, unknown> }) => {
    try {
      if (message.command === "refresh") { await load(); panel.webview.html = render(); }
      if (message.command === "save" && message.data && node.resource === "servers") {
        await api.action(node.connectionId!, node.clusterId!, "servers", recordId("servers", node.record!), "settings", message.data);
        await load(); panel.webview.html = render();
        void vscode.window.showInformationMessage("Свойства рабочего сервера сохранены");
      }
    }
    catch (error) { void vscode.window.showErrorMessage(`1C Cluster Manager: ${(error as Error).message}`); }
  }, undefined, context.subscriptions);
}

export async function showClusterDetails(context: vscode.ExtensionContext, api: ApiClient, node: ClusterNode): Promise<void> {
  if (!node.connectionId || !node.clusterId) return;
  let record = (await api.clusterDetails(node.connectionId, node.clusterId)).records[0] ?? node.record ?? {};
  const panel = vscode.window.createWebviewPanel("onecClusterDetails", `1С: ${node.label}`, vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
  panel.webview.html = detailsHtml(`Кластер — ${String(node.label)}`, record);
  context.subscriptions.push(panel);
  panel.webview.onDidReceiveMessage(async (message: { command?: string }) => {
    try {
      if (message.command === "refresh") {
        record = (await api.clusterDetails(node.connectionId!, node.clusterId!)).records[0] ?? record;
        panel.webview.html = detailsHtml(`Кластер — ${String(node.label)}`, record);
      }
    } catch (error) { void vscode.window.showErrorMessage(`1C Cluster Manager: ${(error as Error).message}`); }
  }, undefined, context.subscriptions);
}
