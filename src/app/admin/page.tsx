import { pageMetadata } from "@/i18n/metadata";
import { getHealth } from "@/server/infra";
import { AdminSolverMetrics } from "./users/solver-metrics-client";
import { SolverVersion } from "./solver-version";
import { LocalizedText } from "@/components/LocalizedText";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const health = await getHealth();

  return (
    <main id="admin-content" className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 sm:py-9 lg:px-8">
      <header className="border-b pb-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl"><LocalizedText message="app_admin_page_tsx1" /></h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground"><LocalizedText message="app_admin_page_tsx2" /></p>
        </div>
      </header>

      <SolverVersion
        plannerReady={Boolean(health.ok && health.cliReady)}
        solverFingerprint={health.serve?.fingerprint ?? null}
      />
      <AdminSolverMetrics />
    </main>
  );
}

export function generateMetadata() { return pageMetadata("admin"); }
