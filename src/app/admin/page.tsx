import { pageMetadata } from "@/i18n/metadata";
import { adminPageClass, AdminPageHeader } from "./admin-page";
import { getHealth } from "@/server/infra";
import { AdminSolverMetrics } from "./users/solver-metrics-client";
import { SolverVersion } from "./solver-version";
import { DiagnosticsPanel } from "./diagnostics-panel";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const health = await getHealth();

  return (
    <main id="admin-content" className={adminPageClass}>
      <AdminPageHeader title="overview" description="overviewHint" />
      <AdminSolverMetrics />

      <SolverVersion
        plannerReady={Boolean(health.ok && health.cliReady)}
        solverFingerprint={health.serve?.fingerprint ?? null}
      />
      <DiagnosticsPanel />
    </main>
  );
}

export function generateMetadata() { return pageMetadata("admin"); }
