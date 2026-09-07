import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireWebsiteAdmin } from "@/server/auth/authorization";

export default async function AdminOnlyLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  try {
    await requireWebsiteAdmin(await headers());
  } catch {
    notFound();
  }
  return children;
}
