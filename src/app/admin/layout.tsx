import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { requireWebsiteAdmin } from "@/server/auth/authorization";
import { AdminNav } from "./admin-nav";
import { LocalizedText } from "@/components/LocalizedText";
import { LanguageSwitch } from "@/i18n/client";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  try {
    await requireWebsiteAdmin(await headers());
  } catch {
    notFound();
  }

  return (
    <div className="min-h-screen bg-muted/35">
      <a href="#admin-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-background focus:px-4 focus:py-3 focus:shadow-md">
        <LocalizedText message="app_admin_layout_tsx1" />
      </a>
      <header className="border-b border-border/70 bg-background">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <p className="min-w-28 text-sm font-semibold"><LocalizedText message="app_admin_layout_tsx2" /></p>
          <div className="flex items-center gap-3"><LanguageSwitch /><AdminNav /></div>
        </div>
      </header>
      {children}
    </div>
  );
}
