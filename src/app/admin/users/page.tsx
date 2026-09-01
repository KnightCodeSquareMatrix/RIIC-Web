import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { requireWebsiteAdmin } from "@/server/auth/authorization";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  try {
    await requireWebsiteAdmin(await headers());
  } catch {
    notFound();
  }
  redirect("/admin#users");
}
