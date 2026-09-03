import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "使用帮助 · 可露希尔基建终端",
  description: "快速排查干员数据、排班结果和配置流程中的常见问题。",
};

const quickChecks = [
  {
    title: "结果里有我没有的干员",
    description: "先确认当前数据是不是「243 全精二示例」。示例 Box 不代表你的实际持有情况。",
    href: "/help/owned-operators?issue=unexpected-operators",
  },
  {
    title: "配置弹窗直接到了第 2 步",
    description: "这是因为浏览器已经保存过 Box。点顶部第 1 步「干员数据」即可返回。",
    href: "/help/owned-operators?issue=saved-box",
  },
  {
    title: "换过 Box，结果却没变化",
    description: "完成设置后要重新生成排班；已经生成的旧方案不会自动套用新 Box。",
    href: "/help/owned-operators?issue=box-not-applied",
  },
  {
    title: "提示请求过多或并发已满",
    description: "停止连续点击，按提示等待；仍繁忙就换一个时间段再生成，不用重新导入 Box。",
    href: "/help/owned-operators?issue=busy",
  },
];

export default function HelpHomePage() {
  return (
    <article className="flex w-full flex-col gap-5 pt-5">
      <section className="grid gap-3 md:grid-cols-2" aria-label="帮助入口">
        <Link
          href="/help/import-operators"
          className="group relative min-h-40 overflow-hidden bg-[#272A2B] p-5 text-white outline-none transition-[transform,box-shadow] hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-[#FFD501] motion-reduce:transform-none"
        >
          <span className="absolute inset-x-0 top-0 h-1 bg-[#FFD800]" aria-hidden="true" />
          <span className="text-xs text-white/48">第一次导入</span>
          <strong className="mt-3 block max-w-xl text-xl font-medium">查看完整的干员 Box 图文步骤</strong>
          <span className="mt-8 inline-flex min-h-11 items-center gap-2 text-sm text-[#FFD800]">
            打开教程<ArrowRight className="size-4 transition-transform group-hover:translate-x-1 motion-reduce:transform-none" aria-hidden="true" />
          </span>
        </Link>
        <Link
          href="/help/owned-operators?issue=unexpected-operators"
          className="group relative min-h-40 overflow-hidden bg-[#272A2B] p-5 text-white outline-none transition-[transform,box-shadow] hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-[#22BBFF] motion-reduce:transform-none"
        >
          <span className="absolute inset-x-0 top-0 h-1 bg-[#22BBFF]" aria-hidden="true" />
          <span className="text-xs text-white/48">常见问题</span>
          <strong className="mt-3 block max-w-xl text-xl font-medium">切换成自己实际拥有的干员</strong>
          <span className="mt-8 inline-flex min-h-11 items-center gap-2 text-sm text-[#22BBFF]">
            查看步骤<ArrowRight className="size-4 transition-transform group-hover:translate-x-1 motion-reduce:transform-none" aria-hidden="true" />
          </span>
        </Link>
      </section>

      <section aria-labelledby="quick-check-title">
        <div className="mb-2 flex min-w-0 items-center gap-2.5">
          <span className="h-5 w-1 shrink-0 bg-[#22BBFF]" aria-hidden="true" />
          <h2 id="quick-check-title" className="text-sm font-medium text-[#313131]">30 秒自检</h2>
        </div>
        <ol className="divide-y divide-border border-y border-border">
          {quickChecks.map(({ title, description, href }, index) => (
            <li key={title}>
              <Link
                href={href}
                data-quick-check-link
                className="group grid min-h-24 grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 px-2 py-4 outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-3"
                aria-labelledby={`quick-check-${index}`}
              >
                <span className="font-number text-sm text-[#313131]/38">{String(index + 1).padStart(2, "0")}</span>
                <span className="min-w-0">
                  <strong id={`quick-check-${index}`} className="block text-sm font-semibold">{title}</strong>
                  <span className="mt-1 block text-sm leading-6 text-muted-foreground">{description}</span>
                </span>
                <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1 motion-reduce:transform-none" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-t border-border pt-5" aria-labelledby="more-help-title">
        <h2 id="more-help-title" className="text-sm font-semibold">仍然不对？</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">记录当前 Box 来源、拥有干员数量、布局类型和错误码，再提交反馈。不要公开账号密码、验证码或完整登录凭据。</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link className="inline-flex min-h-10 items-center rounded-[4px] bg-foreground px-3 text-sm font-medium text-background outline-none hover:opacity-85 focus-visible:ring-2 focus-visible:ring-ring" href="/">返回计算器检查</Link>
          <a className="inline-flex min-h-10 items-center rounded-[4px] border border-border px-3 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring" href="https://github.com/KnightCodeSquareMatrix/RIIC-Web/issues" target="_blank" rel="noreferrer">提交问题反馈</a>
        </div>
      </section>
    </article>
  );
}
