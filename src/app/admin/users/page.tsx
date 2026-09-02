import { AdminUserManagement } from "./users-client";

export const dynamic = "force-dynamic";

export default function AdminUsersPage() {
  return (
    <main id="admin-content" className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <AdminUserManagement />
    </main>
  );
}
