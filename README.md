# 1C Cluster Manager for VS Code

> 🚧 **Проект находится в активной разработке.** API, настройки и состав функций могут изменяться; перед административными операциями используйте тестовый контур.

Самостоятельное решение для администрирования кластеров 1С:Предприятия из VS Code через штатные `RAS` и `rac`.

## Интерфейс

![Управление кластерами 1С в VS Code](docs/images/vscode-clusters.png)

На снимке показаны реальные локальные подключения к платформам 1С 8.3.27, 8.3.24 и 8.5.1; для кластера 8.3.27 раскрыт список информационных баз.

Проект состоит из двух частей:

- [`backend`](backend) — локальный REST API, который безопасно запускает `rac` и преобразует его вывод в JSON;
- [`extension`](extension) — нативное расширение VS Code с деревом кластеров и командами управления.

## Возможности

- несколько подключений к RAS и отдельный `rac` для каждого подключения;
- автоматический поиск наиболее новой установленной версии `rac.exe`;
- просмотр кластеров, информационных баз, сеансов, соединений, блокировок, рабочих серверов, процессов, менеджеров и сервисов;
- завершение сеанса и прерывание текущего серверного вызова;
- разрыв соединения и выключение рабочего процесса;
- блокировка начала сеансов и регламентных заданий информационной базы;
- хранение паролей администраторов в VS Code `SecretStorage`;
- опциональная bearer-аутентификация backend;
- автоматический запуск встроенного backend при открытии панели расширения.
- регистрация и безопасное снятие регистрации информационных баз без удаления физической БД;
- управление выдачей лицензий сервером 1С;
- локальный MCP-сервер для агентской разработки.

## MCP для агентов

Workspace-конфигурация [`.vscode/mcp.json`](.vscode/mcp.json) запускает stdio-сервер из пакета [`mcp`](mcp). Перед использованием соберите проект и запустите backend. MCP предоставляет инструменты:

- `connections_list`, `clusters_list`;
- `infobases_list`, `infobase_get`, `infobase_register`, `infobase_controls_set`, `infobase_unregister`;
- `sessions_list`, `session_terminate`, `locks_list`.

По умолчанию MCP подключается к `http://127.0.0.1:32145`. Адрес, bearer-токен и административные учётные данные можно передать переменными `ONEC_CLUSTER_MANAGER_BACKEND_URL`, `ONEC_CLUSTER_MANAGER_API_TOKEN`, `ONEC_CLUSTER_MANAGER_CLUSTER_USER`, `ONEC_CLUSTER_MANAGER_CLUSTER_PASSWORD`, `ONEC_CLUSTER_MANAGER_INFOBASE_USER` и `ONEC_CLUSTER_MANAGER_INFOBASE_PASSWORD`. Не добавляйте секреты в `mcp.json`.

Инструмент `infobase_unregister` требует явного подтверждения `UNREGISTER`. Backend намеренно не добавляет `--drop-database`: удаляется только регистрация из кластера.

## Полный E2E-цикл

```powershell
$env:ONEC_E2E_RAC_PATH = "C:\Program Files\1cv8\8.3.27.2214\bin\rac.exe"
npm run test:e2e
npm run test:visual:launch
```

E2E-тест требует Docker, доступный тестовый RAS (по умолчанию `localhost:2545`) и образ `akocur/postgresql-1c-17:1`. Он создаёт контейнер с уникальным именем и временную базу `codex_e2e_*`, проверяет регистрацию, блокировку сеансов, блокировку регламентных заданий, запрет/разрешение выдачи лицензий и снятие регистрации. Перед очисткой контейнера тест отдельно проверяет, что физическая БД не была удалена. Существующие информационные базы тест не изменяет.

Последний успешный отчёт: [`docs/test-results/full-cycle.json`](docs/test-results/full-cycle.json).

### Визуальная проверка

![Временная база в дереве трёх кластеров](docs/images/vscode-visual-e2e-blocked.png)

![Блокировки и выдача лицензий в свойствах временной базы](docs/images/vscode-visual-e2e-controls.png)

Снимки сделаны в реальном изолированном Extension Development Host: на первом видна временная база среди подключений 8.3.24, 8.3.27 и 8.5.1; на втором — её полные свойства `sessions-deny: on`, `scheduled-jobs-deny: on` и `license-distribution: deny`. После снимка сценарий вернул `off/off/allow` и снял регистрацию.

## Быстрый старт

Требуются Node.js 20+, VS Code 1.96+, запущенный RAS и установленная утилита `rac`.

```powershell
npm install
npm run check
npm run package --workspace onec-cluster-manager
```

Установите созданный файл `extension/onec-cluster-manager-0.1.0.vsix` командой **Extensions: Install from VSIX...**. Затем откройте раздел «Кластеры 1С» на панели активности и нажмите «Добавить подключение».

Для локальных установок расширение само запускает упакованный backend на `127.0.0.1:32145`. Адрес и автозапуск настраиваются параметрами `onecClusterManager.backend.url` и `onecClusterManager.backend.autoStart`.

## Самостоятельный запуск backend

```powershell
$env:ONEC_CLUSTER_MANAGER_HOST = "127.0.0.1"
$env:ONEC_CLUSTER_MANAGER_PORT = "32145"
$env:ONEC_CLUSTER_MANAGER_CONFIG_FILE = "C:\ProgramData\onec-cluster-manager-vscode\connections.json"
$env:ONEC_CLUSTER_MANAGER_API_TOKEN = "replace-with-a-long-random-value" # необязательно для loopback
npm run build --workspace @onec-cluster-manager/backend
npm start --workspace @onec-cluster-manager/backend
```

Если задан `ONEC_CLUSTER_MANAGER_API_TOKEN`, сохраните то же значение командой **1C: Указать токен backend**.

## API

Основные маршруты:

```text
GET/POST  /api/connections
DELETE    /api/connections/{connectionId}
GET       /api/connections/{connectionId}/clusters
GET       /api/connections/{connectionId}/clusters/{clusterId}/infobases
GET       /api/connections/{connectionId}/clusters/{clusterId}/sessions
GET       /api/connections/{connectionId}/clusters/{clusterId}/connections
GET       /api/connections/{connectionId}/clusters/{clusterId}/locks
GET       /api/connections/{connectionId}/clusters/{clusterId}/servers
GET       /api/connections/{connectionId}/clusters/{clusterId}/processes
GET       /api/connections/{connectionId}/clusters/{clusterId}/managers
GET       /api/connections/{connectionId}/clusters/{clusterId}/services
```

Административные операции выполняются `POST`-маршрутами `terminate`, `interrupt`, `disconnect`, `turn-off` и `settings`. Backend по умолчанию слушает только loopback-интерфейс. Учётные данные кластера и информационной базы не записываются backend на диск.

## Разработка

Откройте корень репозитория в VS Code и запустите конфигурацию **Run 1C Cluster Manager Extension**. Перед запуском задача сборки скомпилирует backend и скопирует его в пакет расширения.
