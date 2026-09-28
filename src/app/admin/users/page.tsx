import { pageMetadata } from "@/i18n/metadata";
import { adminPageClass, AdminPageHeader } from "../admin-page";
import { AdminUserManagement } from "./users-client";

export const dynamic = "force-dynamic";

export default function AdminUsersPage() {
  return (
    <main id="admin-content" className={adminPageClass}>
      <AdminPageHeader title="users" description="usersHint" />
      <AdminUserManagement />
    </main>
  );
}

export function generateMetadata() { return pageMetadata("admin_users"); }
