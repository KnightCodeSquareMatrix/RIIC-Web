"use client";
import { useTranslations } from "next-intl";

import Link from "next/link";
import type { ReactNode } from "react";

import { HelpBackToTop } from "@/components/help/HelpBackToTop";
import { HelpFloatingNav } from "@/components/help/HelpFloatingNav";

import { LanguageSwitch } from "@/i18n/client";

export default function HelpLayout({ children }: { children: ReactNode }) {
  const intl = useTranslations();

  return (
    <main className="flex min-h-dvh flex-col bg-background text-foreground">
      <a
        href="#help-content"
        className="sr-only z-50 bg-background px-4 py-3 font-medium focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:ring-2 focus:ring-ring"
      >
        {intl("app_help_layout.skipToHelpContent")}
      </a>

      <header className="border-b border-border/80 bg-background">
        <div className="app-content-track flex min-h-14 items-center justify-between gap-4">
          <Link className="inline-flex min-h-11 items-center gap-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring" href="/help">
            <span className="h-5 w-1 shrink-0 bg-[#FFD501]" aria-hidden="true" />
            <span className="text-sm font-semibold">{intl("app_help_layout.helpCenter")}</span>
          </Link>
          <div className="flex items-center gap-3">
            <LanguageSwitch />
            <Link className="inline-flex min-h-11 items-center text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href="/">
              {intl("app_help_layout.backToCalculator")}
            </Link>
          </div>
        </div>
      </header>

      <div className="app-content-track flex-1 pb-8 sm:pb-10">
        <div id="help-content" className="min-w-0" tabIndex={-1}>{children}</div>
      </div>

      <footer className="app-content-track flex flex-wrap items-center gap-x-4 border-t border-border/80 py-5 pr-20 text-xs text-muted-foreground sm:pr-24">
        <Link className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-foreground" href="/terms">{intl("app_help_layout.terms")}</Link>
        <Link className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-foreground" href="/privacy">{intl("app_help_layout.privacy")}</Link>
        <Link className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-foreground" href="/about">{intl("app_help_layout.about")}</Link>
        <a className="ml-auto whitespace-nowrap underline underline-offset-4 hover:text-foreground max-sm:ml-0 max-sm:w-full" href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">沪ICP备2026041492号</a>
      </footer>

      <HelpBackToTop />
      <HelpFloatingNav />
    </main>
  );
}
