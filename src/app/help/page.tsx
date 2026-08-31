import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpenText, CircleAlert, Database, Import, MousePointerClick, RefreshCcw, Settings2, UsersRound } from "lucide-react";

export const metadata: Metadata = {
  title: "使用帮助 · 可露希尔基建终端",
  description: "快速排查干员数据、排班结果和配置流程中的常见问题。",
};

const quickChecks = [
  {
    title: "结果里有我没有的干员",
    description: "先确认当前数据是不是「243 全精二示例」。示例 Box 不代表你的实际持有情况。",
    icon: UsersRound,
    href: "/help/owned-operators?issue=unexpected-operators",
    linkLabel: "查看解决方案",
  },
  {
    title: "配置弹窗直接到了第 2 步",
    description: "这是因为浏览器已经保存过 Box。点顶部第 1 步「干员数据」即可返回。",
    icon: MousePointerClick,
    href: "/help/owned-operators?issue=saved-box",
    linkLabel: "查看解决方案",
  },
  {
    title: "换过 Box，结果却没变化",
    description: "完成设置后要重新生成排班；已经生成的旧方案不会自动套用新 Box。",
    icon: RefreshCcw,
    href: "/help/owned-operators?issue=box-not-applied",
    linkLabel: "查看解决方案",
  },
  {
    title: "提示请求过多或并发已满",
    description: "停止连续点击，按提示等待；仍繁忙就换一个时间段再生成，不用重新导入 Box。",
    icon: CircleAlert,
    href: "/help/owned-operators?issue=busy",
    linkLabel: "查看解决方案",
  },
];

export default function HelpHomePage() {
  return (
    <article className="overflow-hidden rounded-3xl border border-border/80 bg-background/95 shadow-[0_26px_80px_-48px_rgba(0,0,0,0.45)]">
      <header className="relative overflow-hidden border-b border-border/80 bg-gradient-to-br from-background via-background to-muted/60 px-5 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
        <div aria-hidden="true" className="absolute -right-24 -top-32 size-80 rounded-full border-[52px] border-amber-300/20" />
        <div className="relative flex items-start gap-4">
          <span className="mt-1 hidden size-12 shrink-0 place-items-center rounded-2xl bg-foreground text-background shadow-lg sm:grid">
            <BookOpenText className="size-6" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground">HELP CENTER · 使用文档</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl lg:text-[2.75rem]">使用帮助</h1>
          </div>
        </div>
      </header>

      <div className="grid gap-8 px-5 py-7 sm:px-8 sm:py-9 lg:px-10 lg:py-10">
        <section aria-labelledby="import-guide-title">
          <Link
            href="/help/import-operators"
            className="group grid gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm outline-none transition-[background-color,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-foreground/30 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transform-none motion-reduce:transition-none sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"
          >
            <span className="grid size-12 place-items-center rounded-xl bg-muted text-primary ring-1 ring-border">
              <Import className="size-6" aria-hidden="true" />
            </span>
            <span>
              <strong id="import-guide-title" className="block text-2xl leading-tight sm:text-3xl">第一次导入？看完整图文步骤</strong>
            </span>
            <span className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary">
              详细教程<ArrowRight className="size-4 transition-transform group-hover:translate-x-1 motion-reduce:transform-none" aria-hidden="true" />
            </span>
          </Link>
        </section>

        <section aria-labelledby="owned-box-help-title">
          <Link
            href="/help/owned-operators?issue=unexpected-operators"
            className="group grid gap-5 rounded-2xl border border-foreground bg-foreground p-5 text-background shadow-lg shadow-foreground/10 outline-none transition-transform duration-200 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transform-none motion-reduce:transition-none sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"
          >
            <span className="grid size-12 place-items-center rounded-xl bg-background/12 text-background ring-1 ring-background/15">
              <Database className="size-6" aria-hidden="true" />
            </span>
            <span>
              <span className="text-xs font-semibold tracking-[0.12em] text-amber-300">最常见问题</span>
              <strong id="owned-box-help-title" className="mt-1 block text-xl">如何切换成我已有的干员？</strong>
              <span className="mt-2 block text-sm leading-6 text-background/70">误点「全角色导入」、排出了未拥有干员，或者想更新练度，都从这里开始。</span>
            </span>
            <span className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-background">
              查看步骤<ArrowRight className="size-4 transition-transform group-hover:translate-x-1 motion-reduce:transform-none" aria-hidden="true" />
            </span>
          </Link>
        </section>

        <section aria-labelledby="quick-check-title">
          <div className="flex items-center gap-2">
            <CircleAlert className="size-5 text-amber-600" aria-hidden="true" />
            <h2 id="quick-check-title" className="text-xl font-semibold">30 秒自检</h2>
          </div>
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {quickChecks.map(({ title, description, icon: Icon, href, linkLabel }, index) => (
              <li key={title}>
                <Link
                  href={href}
                  data-quick-check-link
                  className="group block h-full rounded-2xl border border-border/80 bg-card p-4 shadow-sm outline-none transition-[background-color,border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-foreground/30 hover:bg-muted/40 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transform-none motion-reduce:transition-none"
                  aria-labelledby={`quick-check-${index}`}
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="grid size-9 place-items-center rounded-xl bg-muted text-primary"><Icon className="size-4.5" aria-hidden="true" /></span>
                    <ArrowRight className="mt-1 size-4 text-muted-foreground transition-transform group-hover:translate-x-1 motion-reduce:transform-none" aria-hidden="true" />
                  </span>
                  <h3 id={`quick-check-${index}`} className="mt-3 font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
                  <span className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary">
                    {linkLabel}<ArrowRight className="size-4 transition-transform group-hover:translate-x-1 motion-reduce:transform-none" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="more-help-title">
          <h2 id="more-help-title" className="text-xl font-semibold">仍然不对？</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">记录当前 Box 来源、拥有干员数量、布局类型和错误码，再提交反馈。不要公开账号密码、验证码或完整登录凭据。</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-foreground px-4 text-sm font-medium text-background outline-none hover:opacity-85 focus-visible:ring-2 focus-visible:ring-ring" href="/">
              <Settings2 className="size-4" aria-hidden="true" />返回计算器检查
            </Link>
            <a className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring" href="https://github.com/KnightCodeSquareMatrix/RIIC-Web/issues" target="_blank" rel="noreferrer">提交问题反馈</a>
          </div>
        </section>
      </div>
    </article>
  );
}
