"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useLanguageDemo } from "@/language-demo";

const quickChecks = [
  {
    zh: ["结果里有我没有的干员", "先确认当前数据是不是「243 全精二示例」。示例 Box 不代表你的实际持有情况。"],
    en: ["The result includes operators I do not own", "Check whether the current data is the “243 max-level sample”. The sample Box does not represent your account."],
    href: "/help/owned-operators?issue=unexpected-operators",
  },
  {
    zh: ["配置弹窗直接到了第 2 步", "这是因为浏览器已经保存过 Box。点顶部第 1 步「干员数据」即可返回。"],
    en: ["The setup dialog opens at step 2", "A Box is already saved in this browser. Select step 1, “Operator Data”, at the top to go back."],
    href: "/help/owned-operators?issue=saved-box",
  },
  {
    zh: ["换过 Box，结果却没变化", "完成设置后要重新生成排班；已经生成的旧方案不会自动套用新 Box。"],
    en: ["I changed the Box, but the result did not change", "Generate a new schedule after saving the setup. Existing results do not adopt the new Box automatically."],
    href: "/help/owned-operators?issue=box-not-applied",
  },
  {
    zh: ["提示请求过多或并发已满", "停止连续点击，按提示等待；仍繁忙就换一个时间段再生成，不用重新导入 Box。"],
    en: ["Too many requests or concurrency limit reached", "Stop clicking repeatedly and wait as instructed. If it remains busy, try later; you do not need to import the Box again."],
    href: "/help/owned-operators?issue=busy",
  },
];

export default function HelpHomePage() {
  const { locale } = useLanguageDemo();
  const en = locale === "en";
  return (
    <article className="flex w-full flex-col gap-5 pt-5">
      <section className="grid gap-3 md:grid-cols-2" aria-label={en ? "Help topics" : "帮助入口"}>
        <Link
          href="/help/import-operators"
          className="group relative min-h-40 overflow-hidden bg-[#272A2B] p-5 text-white outline-none transition-[transform,box-shadow] hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-[#FFD501] motion-reduce:transform-none"
        >
          <span className="absolute inset-x-0 top-0 h-1 bg-[#FFD800]" aria-hidden="true" />
          <span className="text-xs text-white/48">{en ? "FIRST IMPORT" : "第一次导入"}</span>
          <strong className="mt-3 block max-w-xl text-xl font-medium">{en ? "Import your Operator Box step by step" : "查看完整的干员 Box 图文步骤"}</strong>
          <span className="mt-8 inline-flex min-h-11 items-center gap-2 text-sm text-[#FFD800]">
            {en ? "Open tutorial" : "打开教程"}<ArrowRight className="size-4 transition-transform group-hover:translate-x-1 motion-reduce:transform-none" aria-hidden="true" />
          </span>
        </Link>
        <Link
          href="/help/owned-operators?issue=unexpected-operators"
          className="group relative min-h-40 overflow-hidden bg-[#272A2B] p-5 text-white outline-none transition-[transform,box-shadow] hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-[#22BBFF] motion-reduce:transform-none"
        >
          <span className="absolute inset-x-0 top-0 h-1 bg-[#22BBFF]" aria-hidden="true" />
          <span className="text-xs text-white/48">{en ? "COMMON ISSUE" : "常见问题"}</span>
          <strong className="mt-3 block max-w-xl text-xl font-medium">{en ? "Switch to the operators you actually own" : "切换成自己实际拥有的干员"}</strong>
          <span className="mt-8 inline-flex min-h-11 items-center gap-2 text-sm text-[#22BBFF]">
            {en ? "View steps" : "查看步骤"}<ArrowRight className="size-4 transition-transform group-hover:translate-x-1 motion-reduce:transform-none" aria-hidden="true" />
          </span>
        </Link>
      </section>

      <Link id="maa-box-video" href="/help/beginner" className="group flex min-h-28 scroll-mt-5 items-center justify-between gap-4 border-y border-border px-3 py-5 outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring sm:px-5">
        <span className="min-w-0">
          <strong className="block text-lg font-semibold">{en ? "Beginner tutorials" : "新手教程"}</strong>
          <span className="mt-2 block text-sm leading-6 text-muted-foreground">{en ? "Video tutorials for MAA Box export, manual scheduling, shift changes, and Orundum production." : "MAA 获取 Box、手动抄作业、换班与搓玉视频教程。"}</span>
        </span>
        <ArrowRight className="size-5 shrink-0 transition-transform group-hover:translate-x-1 motion-reduce:transform-none" aria-hidden="true" />
      </Link>

      <section aria-labelledby="quick-check-title">
        <div className="mb-2 flex min-w-0 items-center gap-2.5">
          <span className="h-5 w-1 shrink-0 bg-[#22BBFF]" aria-hidden="true" />
          <h2 id="quick-check-title" className="text-sm font-medium text-[#313131]">{en ? "30-second check" : "30 秒自检"}</h2>
        </div>
        <ol className="divide-y divide-border border-y border-border">
          {quickChecks.map((item, index) => {
            const [title, description] = en ? item.en : item.zh;
            return <li key={item.href}>
              <Link
                href={item.href}
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
            </li>;
          })}
        </ol>
      </section>

      <section className="border-t border-border pt-5" aria-labelledby="more-help-title">
        <h2 id="more-help-title" className="text-sm font-semibold">{en ? "Still not working?" : "仍然不对？"}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{en ? "Record the current Box source, owned-operator count, base layout, and error code before reporting the issue. Never publish passwords, verification codes, or complete login credentials." : "记录当前 Box 来源、拥有干员数量、布局类型和错误码，再提交反馈。不要公开账号密码、验证码或完整登录凭据。"}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link className="inline-flex min-h-10 items-center rounded-[4px] bg-foreground px-3 text-sm font-medium text-background outline-none hover:opacity-85 focus-visible:ring-2 focus-visible:ring-ring" href="/">{en ? "Check the calculator" : "返回计算器检查"}</Link>
          <a className="inline-flex min-h-10 items-center rounded-[4px] border border-border px-3 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring" href="https://github.com/KnightCodeSquareMatrix/RIIC-Web/issues" target="_blank" rel="noreferrer">{en ? "Report an issue" : "提交问题反馈"}</a>
        </div>
      </section>
    </article>
  );
}
