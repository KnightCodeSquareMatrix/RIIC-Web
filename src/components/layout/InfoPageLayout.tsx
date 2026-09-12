"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { LanguageSwitch } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { FilingLinks } from "./FilingLinks";

/** Shared public-document shell: help and release notes don't load the calculator. */
export function InfoPageLayout({ title, href, contentId, children, floatingControls }: {
  title: string;
  href: string;
  contentId: string;
  children: ReactNode;
  floatingControls?: ReactNode;
}) {
  const t = useTranslations("InfoPageLayout");
  return (
    <main className="flex min-h-dvh flex-col bg-background text-foreground">
      <a href={`#${contentId}`} className="sr-only z-50 bg-background px-4 py-3 font-medium focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:ring-2 focus:ring-ring">
        {t("skipToContent")}
      </a>
      <header className="border-b border-border/80 bg-background">
        <div className="app-content-track flex min-h-14 items-center justify-between gap-4">
          <Link className="inline-flex min-h-11 items-center gap-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring" href={href}>
            <span className="h-5 w-1 shrink-0 bg-[#FFD501]" aria-hidden="true" />
            <span className="text-sm font-semibold">{title}</span>
          </Link>
          <div className="flex items-center gap-3">
            <LanguageSwitch />
            <Link className="inline-flex min-h-11 items-center text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href="/">
              {t("backToCalculator")}
            </Link>
          </div>
        </div>
      </header>
      <div className="app-content-track flex-1 pb-8 sm:pb-10">
        <div id={contentId} className="min-w-0" tabIndex={-1}>{children}</div>
      </div>
      <footer className={cn("app-content-track flex flex-wrap items-center gap-x-4 border-t border-border/80 py-5 text-xs text-muted-foreground", floatingControls && "pr-20 sm:pr-24")}>
        <Link className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-foreground" href="/changelog">{t("changelog")}</Link>
        <Link className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-foreground" href="/terms">{t("terms")}</Link>
        <Link className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-foreground" href="/privacy">{t("privacy")}</Link>
        <Link className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-foreground" href="/about">{t("about")}</Link>
        <div className="ml-auto min-w-0 max-sm:ml-0 max-sm:w-full"><FilingLinks /></div>
      </footer>
      {floatingControls}
    </main>
  );
}
