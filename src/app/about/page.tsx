import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Code2, Database, Github, HeartHandshake, Image as ImageIcon, MessageSquareText, UsersRound } from "lucide-react";

export const metadata: Metadata = { title: "关于我们 · 可露希尔基建终端", description: "了解可露希尔基建终端的开发、资料来源与贡献方式。" };

const sources = [
  { title: "arknights-toolbox-data", description: "干员、基建技能与术语数据", href: "https://github.com/arkntools/arknights-toolbox-data", tags: ["干员数据", "基建技能", "图片素材"], icon: Database, tone: "bg-sky-50 text-sky-700" },
  { title: "ArknightsGameResource", description: "干员立绘与部分游戏图片资源", href: "https://github.com/yuanyan3060/ArknightsGameResource", tags: ["干员立绘", "图片素材"], icon: ImageIcon, tone: "bg-indigo-50 text-indigo-700" },
  { title: "明日方舟官方网站", description: "游戏名称、角色与美术资源权利归属", href: "https://ak.hypergryph.com/", tags: ["官方网站", "权利归属"], icon: Code2, tone: "bg-neutral-100 text-neutral-700" },
];

const contributionCards = [
  { title: "项目仓库", description: "查看源码、提交记录与开发进度", href: "https://github.com/KnightCodeSquareMatrix/ArknightsInfraCalc-v2_beta_test_frontend", tags: ["源码", "开发进度"], icon: Github, tone: "bg-neutral-100 text-neutral-700" },
  { title: "参与贡献", description: "提交问题、建议或改进方案", href: "https://github.com/KnightCodeSquareMatrix/ArknightsInfraCalc-v2_beta_test_frontend/issues", tags: ["问题反馈", "功能建议"], icon: MessageSquareText, tone: "bg-emerald-50 text-emerald-700" },
];

type LinkCardItem = (typeof sources)[number] | (typeof contributionCards)[number];

function LinkCard({ item }: { item: LinkCardItem }) {
  const Icon = item.icon;
  return (
    <a href={item.href} target="_blank" rel="noreferrer" className="group flex min-h-32 items-start gap-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-[0_2px_8px_rgba(15,23,42,0.08)] transition duration-200 hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-[0_7px_18px_rgba(15,23,42,0.11)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
      <span className={`grid size-12 shrink-0 place-items-center rounded-full ${item.tone}`}><Icon className="size-6" aria-hidden="true" /></span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-3"><strong className="text-base font-semibold text-neutral-800">{item.title}</strong><ArrowUpRight className="size-4 shrink-0 text-neutral-300 transition-colors group-hover:text-sky-600" aria-hidden="true" /></span>
        <span className="mt-1 block text-sm leading-6 text-neutral-500">{item.description}</span>
        <span className="mt-3 flex flex-wrap gap-1.5">{item.tags.map((tag) => <span key={tag} className="rounded-md bg-sky-50 px-2 py-1 text-[11px] font-medium text-sky-600">{tag}</span>)}</span>
      </span>
    </a>
  );
}

export default function AboutPage() {
  return (
    <main className="min-h-dvh bg-[#f7f7f7] px-4 py-8 text-neutral-800 sm:px-7 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <Link className="inline-flex min-h-11 items-center text-sm text-neutral-500 underline underline-offset-4 hover:text-neutral-800" href="/">返回可露希尔基建终端</Link>
        <section className="mt-5 rounded-2xl border border-neutral-200 bg-white px-5 py-7 shadow-sm sm:px-10 sm:py-10" aria-labelledby="about-title">
          <header className="border-b border-neutral-100 pb-7">
            <p className="text-xs font-semibold tracking-[0.16em] text-sky-600">ABOUT US</p>
            <h1 id="about-title" className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">关于我们</h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-neutral-500 sm:text-base">可露希尔基建终端是面向《明日方舟》玩家的非官方排班辅助工具，希望把复杂的基建配置整理成更容易执行和复查的方案。</p>
          </header>
          <section className="pt-8" aria-labelledby="source-title">
            <h2 id="source-title" className="text-2xl font-semibold tracking-tight">开发资料和数据来源</h2>
            <div className="mt-5 grid gap-3 md:grid-cols-2">{sources.map((item) => <LinkCard key={item.title} item={item} />)}</div>
          </section>
          <section className="mt-10 border-t border-neutral-100 pt-8" aria-labelledby="contribution-title">
            <h2 id="contribution-title" className="text-2xl font-semibold tracking-tight">开发与贡献</h2>
            <div className="mt-5 grid gap-3 md:grid-cols-2">{contributionCards.map((item) => <LinkCard key={item.title} item={item} />)}</div>
          </section>
          <section className="mt-10 border-t border-neutral-100 pt-8" aria-labelledby="support-title">
            <h2 id="support-title" className="text-2xl font-semibold tracking-tight">贡献者与赞助者</h2>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div className="flex min-h-32 items-start gap-4 rounded-xl border border-dashed border-neutral-200 bg-neutral-50/70 p-4"><span className="grid size-12 shrink-0 place-items-center rounded-full bg-violet-50 text-violet-600"><UsersRound className="size-6" aria-hidden="true" /></span><div><h3 className="font-semibold">贡献者名单</h3><p className="mt-1 text-sm leading-6 text-neutral-500">预留头像、名称与贡献内容展示位置。</p><span className="mt-3 inline-block rounded-md bg-neutral-100 px-2 py-1 text-[11px] text-neutral-500">持续补充中</span></div></div>
              <div className="flex min-h-32 items-start gap-4 rounded-xl border border-dashed border-neutral-200 bg-neutral-50/70 p-4"><span className="grid size-12 shrink-0 place-items-center rounded-full bg-rose-50 text-rose-600"><HeartHandshake className="size-6" aria-hidden="true" /></span><div><h3 className="font-semibold">赞助者名单</h3><p className="mt-1 text-sm leading-6 text-neutral-500">预留赞助者名称、头像与公开链接位置。</p><span className="mt-3 inline-block rounded-md bg-neutral-100 px-2 py-1 text-[11px] text-neutral-500">暂未开放</span></div></div>
            </div>
          </section>
        </section>
        <footer className="flex flex-wrap items-center justify-center gap-x-5 py-5 text-xs text-neutral-500"><span>非官方、小范围测试中的排班辅助工具</span><Link className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-neutral-800" href="/terms">服务条款</Link><Link className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-neutral-800" href="/privacy">隐私政策</Link></footer>
      </div>
    </main>
  );
}
