import { RasApplicationManager } from "./applicationManager";
import { discoverRasInstallations } from "./discovery";
import { RasServiceManager } from "./serviceManager";
import type { RasServiceInput, RasStartInput } from "./types";

export class RasLifecycle {
  public constructor(
    public readonly applications: RasApplicationManager,
    public readonly services: RasServiceManager,
  ) {}

  public installations() { return discoverRasInstallations(); }
  public startApplication(input: Partial<RasStartInput>) { return this.applications.start(input); }
  public listApplications() { return this.applications.list(); }
  public stopApplication(id: string) { return this.applications.stop(id); }
  public listServices() { return this.services.list(); }
  public installService(input: Partial<RasServiceInput>) { return this.services.install(input); }
  public startService(name: string) { return this.services.start(name); }
  public stopService(name: string) { return this.services.stop(name); }
  public removeService(name: string) { return this.services.remove(name); }
  public dispose() { this.applications.dispose(); }
}

