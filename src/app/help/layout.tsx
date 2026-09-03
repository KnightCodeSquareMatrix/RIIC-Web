"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { HelpFloatingNav } from "@/components/help/HelpFloatingNav";
import { LanguageDemoSwitch, useLanguageDemo } from "@/language-demo";

export default function HelpLayout({ children }: { children: ReactNode }) {
  const { locale } = useLanguageDemo();
  const en = locale === "en";
  return (
    <main className="flex min-h-dvh flex-col bg-background text-foreground">
      <a
        href="#help-content"
        className="sr-only z-50 bg-background px-4 py-3 font-medium focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:ring-2 focus:ring-ring"
      >
        {en ? "Skip to help content" : "跳到帮助正文"}
      </a>

      <header className="border-b border-border/80 bg-background">
        <div className="app-content-track flex min-h-14 items-center justify-between gap-4">
          <Link className="inline-flex min-h-11 items-center gap-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring" href="/help">
            <span className="h-5 w-1 shrink-0 bg-[#FFD501]" aria-hidden="true" />
            <span className="text-sm font-semibold">{en ? "Help Center" : "使用帮助"}</span>
          </Link>
          <div className="flex items-center gap-3">
            <LanguageDemoSwitch />
            <Link className="inline-flex min-h-11 items-center text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href="/">
              {en ? "Back to Calculator" : "返回基建计算器"}
            </Link>
          </div>
        </div>
      </header>

      <div className="app-content-track flex-1 pb-8 sm:pb-10">
        <div id="help-content" className="min-w-0" tabIndex={-1}>{children}</div>
      </div>

      <footer className="app-content-track flex flex-wrap items-center gap-x-4 border-t border-border/80 py-5 pr-20 text-xs text-muted-foreground sm:pr-24">
        <Link className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-foreground" href="/terms">{en ? "Terms" : "服务条款"}</Link>
        <Link className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-foreground" href="/privacy">{en ? "Privacy" : "隐私政策"}</Link>
        <Link className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-foreground" href="/about">{en ? "About" : "关于我们"}</Link>
        <a className="ml-auto whitespace-nowrap underline underline-offset-4 hover:text-foreground max-sm:ml-0 max-sm:w-full" href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">沪ICP备2026041492号</a>
      </footer>

      <HelpFloatingNav />
    </main>
  );
}
