import { BookOpenText, House } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { HelpFloatingNav } from "@/components/help/HelpFloatingNav";

export default function HelpLayout({ children }: { children: ReactNode }) {
  return (
    <main className="relative isolate min-h-dvh overflow-x-clip bg-muted/35 text-foreground">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_85%_0%,rgba(250,204,21,0.12),transparent_28rem),linear-gradient(to_bottom,rgba(255,255,255,0.82),rgba(245,245,244,0.72))] dark:bg-[radial-gradient(circle_at_85%_0%,rgba(250,204,21,0.08),transparent_28rem)]"
      />
      <a
        href="#help-content"
        className="sr-only z-50 rounded-md bg-background px-4 py-3 font-medium focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:ring-2 focus:ring-ring"
      >
        跳到帮助正文
      </a>

      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/85 backdrop-blur-xl supports-[backdrop-filter]:bg-background/75">
        <div className="mx-auto flex min-h-16 max-w-[90rem] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link className="group inline-flex min-h-11 items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring" href="/help">
            <span className="grid size-9 place-items-center rounded-xl bg-foreground text-background shadow-sm transition-transform duration-200 group-hover:-rotate-3 motion-reduce:transform-none motion-reduce:transition-none">
              <BookOpenText className="size-4.5" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-semibold leading-5">可露希尔帮助中心</span>
              <span className="hidden text-[10px] font-semibold tracking-[0.16em] text-muted-foreground sm:block">RIIC DOCUMENTATION</span>
            </span>
          </Link>
          <Link className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-background/80 px-3 text-sm font-medium text-muted-foreground shadow-sm outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring" href="/">
            <House className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">返回基建计算器</span>
            <span className="sm:hidden">计算器</span>
          </Link>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[90rem] px-4 py-5 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
        <div id="help-content" className="min-w-0" tabIndex={-1}>{children}</div>
      </div>

      <footer className="mx-auto flex max-w-[90rem] flex-wrap items-center gap-x-4 border-t border-border/80 py-5 pl-4 pr-20 text-xs text-muted-foreground sm:pl-6 sm:pr-24 lg:pl-8">
        <span>非官方、小范围测试中的排班辅助工具</span>
        <Link className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-foreground" href="/terms">服务条款</Link>
        <Link className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-foreground" href="/privacy">隐私政策</Link>
        <Link className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-foreground" href="/about">关于我们</Link>
      </footer>

      <HelpFloatingNav />
    </main>
  );
}
