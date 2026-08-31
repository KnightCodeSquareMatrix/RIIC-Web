import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireWebsiteAdmin } from "@/server/auth/authorization";
import { getHealth } from "@/server/infra";
import { AdminUsers } from "./users-client";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  try {
    await requireWebsiteAdmin(await headers());
  } catch {
    notFound();
  }

  const health = await getHealth();
  return (
    <AdminUsers
      plannerReady={Boolean(health.ok && health.cliReady)}
      solverFingerprint={health.serve?.fingerprint ?? null}
    />
  );
}
