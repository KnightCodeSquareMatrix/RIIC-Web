import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { requireWebsiteAdmin } from "@/server/auth/authorization";
import { AdminNav } from "./admin-nav";
import { LocalizedText } from "@/components/LocalizedText";
import { LanguageDemoSwitch } from "@/language-demo";

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
        <LocalizedText zh="跳到主要内容" en="Skip to main content" />
      </a>
      <header className="border-b border-border/70 bg-background">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <p className="min-w-28 text-sm font-semibold"><LocalizedText zh="管理后台" en="Administration" /></p>
          <div className="flex min-w-0 max-w-full items-center gap-3"><LanguageDemoSwitch /><AdminNav /></div>
        </div>
      </header>
      {children}
    </div>
  );
}
