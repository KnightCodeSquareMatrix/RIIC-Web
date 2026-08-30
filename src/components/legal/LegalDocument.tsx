import Link from "next/link";
import type { ReactNode } from "react";

export function LegalDocument({
  eyebrow,
  title,
  effectiveDate,
  children,
}: {
  eyebrow: string;
  title: string;
  effectiveDate: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-dvh bg-background px-5 py-10 text-foreground sm:px-8 sm:py-14">
      <article className="mx-auto max-w-3xl">
        <Link className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground" href="/">
          返回可露希尔基建终端
        </Link>
        <header className="mt-8 border-b border-border pb-7">
          <p className="text-xs font-medium tracking-wide text-primary">{eyebrow}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            版本与生效日期：<span className="font-number">{effectiveDate}</span>
          </p>
        </header>
        <div className="prose prose-neutral mt-8 max-w-none space-y-8 text-sm leading-7 dark:prose-invert [&_a]:font-medium [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mb-3 [&_h2]:mt-0 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_li]:my-1 [&_p]:my-2">
          {children}
        </div>
      </article>
      <footer className="mx-auto mt-10 flex max-w-3xl flex-wrap items-center gap-x-4 border-t border-border pt-5 text-xs text-muted-foreground">
        <span>非官方、小范围测试中的排班辅助工具</span>
        <Link className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-foreground" href="/terms">
          本站服务条款
        </Link>
        <Link className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-foreground" href="/privacy">
          本站隐私政策
        </Link>
        <Link className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-foreground" href="/about">
          关于我们
        </Link>
      </footer>
    </main>
  );
}
