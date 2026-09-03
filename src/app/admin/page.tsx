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
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">RIIC Operations</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl"><LocalizedText zh="运行概览" en="Operations overview" /></h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground"><LocalizedText zh="核对线上构建并观察实时求解状态。" en="Verify the deployed build and monitor live solver status." /></p>
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
