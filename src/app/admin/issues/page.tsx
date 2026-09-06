import { pageMetadata } from "@/i18n/metadata";
import { AdminIssues } from "./issues-client";

export const dynamic = "force-dynamic";

export default function AdminIssuesPage() {
  return <AdminIssues />;
}

export function generateMetadata() { return pageMetadata("admin_issues"); }
