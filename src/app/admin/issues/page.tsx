import { pageMetadata } from "@/i18n/metadata";
import { AdminIssues } from "./issues-client";
import { headers } from "next/headers";
import { requireWebsiteReviewer } from "@/server/auth/authorization";

export const dynamic = "force-dynamic";

export default async function AdminIssuesPage() {
  const actor = await requireWebsiteReviewer(await headers());
  return <AdminIssues isAdmin={actor.isAdmin} />;
}

export function generateMetadata() { return pageMetadata("admin_issues"); }
