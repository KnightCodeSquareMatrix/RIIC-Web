import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireWebsiteReviewer } from "@/server/auth/authorization";
import { AdminShell } from "./admin-shell";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  let access;
  try {
    access = await requireWebsiteReviewer(await headers());
  } catch {
    notFound();
  }
  return <AdminShell isAdmin={access.isAdmin} name={access.session.user.name}>{children}</AdminShell>;
}
