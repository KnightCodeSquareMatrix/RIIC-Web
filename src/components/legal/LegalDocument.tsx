"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { LanguageDemoSwitch, useLanguageDemo } from "@/language-demo";

export function LegalDocument({
  eyebrow,
  title,
  effectiveDate,
  children,
  englishEyebrow,
  englishTitle,
  englishChildren,
}: {
  eyebrow: string;
  title: string;
  effectiveDate: string;
  children: ReactNode;
  englishEyebrow: string;
  englishTitle: string;
  englishChildren: ReactNode;
}) {
  const { locale } = useLanguageDemo();
  const en = locale === "en";
  return (
    <main className="min-h-dvh bg-background px-5 py-10 text-foreground sm:px-8 sm:py-14">
      <article className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between gap-4"><Link className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground" href="/">{en ? "Back to Closure Infrastructure Terminal" : "返回可露希尔基建终端"}</Link><LanguageDemoSwitch /></div>
        <header className="mt-8 border-b border-border pb-7">
          <p className="text-xs font-medium tracking-wide text-primary">{en ? englishEyebrow : eyebrow}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{en ? englishTitle : title}</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {en ? "Version and effective date: " : "版本与生效日期："}<span className="font-number">{effectiveDate}</span>
          </p>
        </header>
        <div className="prose prose-neutral mt-8 max-w-none space-y-8 text-sm leading-7 dark:prose-invert [&_a]:font-medium [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mb-3 [&_h2]:mt-0 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_li]:my-1 [&_p]:my-2">
          {en ? englishChildren : children}
        </div>
      </article>
      <footer className="mx-auto mt-10 flex max-w-3xl flex-wrap items-center gap-x-4 border-t border-border pt-5 text-xs text-muted-foreground">
        <Link className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-foreground" href="/terms">
          {en ? "Terms of Service" : "本站服务条款"}
        </Link>
        <Link className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-foreground" href="/privacy">
          {en ? "Privacy Policy" : "本站隐私政策"}
        </Link>
        <Link className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-foreground" href="/about">
          {en ? "About" : "关于我们"}
        </Link>
      </footer>
    </main>
  );
}
