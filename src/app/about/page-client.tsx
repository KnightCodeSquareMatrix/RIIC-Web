"use client";
import { useTranslations, useLocale } from "next-intl";
import { messageRecord } from "@/i18n/translate";

import Link from "next/link";
import { ArrowUpRight, Code2, Database, Github, HeartHandshake, Image as ImageIcon, MessageSquareText, UsersRound, type LucideIcon } from "lucide-react";

import { LanguageSwitch } from "@/i18n/client";

type LinkCardItem = {
  title: string;
  titleKey?: "officialWebsite" | "contribute";
  zh: [string, string[]];
  en: [string, string[]];
  href: string;
  icon: LucideIcon;
  tone: string;
};

const sources: LinkCardItem[] = [
  { title: "arknights-toolbox-data", zh: messageRecord("zh", "app_about_page_content").value as [string, string[]], en: messageRecord("en", "app_about_page_content").value as [string, string[]], href: "https://github.com/arkntools/arknights-toolbox-data", icon: Database, tone: "bg-sky-50 text-sky-700" },
  { title: "ArknightsGameResource", zh: messageRecord("zh", "app_about_page_content2").value as [string, string[]], en: messageRecord("en", "app_about_page_content2").value as [string, string[]], href: "https://github.com/yuanyan3060/ArknightsGameResource", icon: ImageIcon, tone: "bg-indigo-50 text-indigo-700" },
  { title: "", titleKey: "officialWebsite", zh: messageRecord("zh", "app_about_page_content3").value as [string, string[]], en: messageRecord("en", "app_about_page_content3").value as [string, string[]], href: "https://ak.hypergryph.com/", icon: Code2, tone: "bg-neutral-100 text-neutral-700" },
];

const contributionCards: LinkCardItem[] = [
  { title: "RIIC-Web", zh: messageRecord("zh", "app_about_page_content4").value as [string, string[]], en: messageRecord("en", "app_about_page_content4").value as [string, string[]], href: "https://github.com/KnightCodeSquareMatrix/RIIC-Web", icon: Github, tone: "bg-neutral-100 text-neutral-700" },
  { title: "", titleKey: "contribute", zh: messageRecord("zh", "app_about_page_content5").value as [string, string[]], en: messageRecord("en", "app_about_page_content5").value as [string, string[]], href: "https://github.com/KnightCodeSquareMatrix/RIIC-Web/issues", icon: MessageSquareText, tone: "bg-emerald-50 text-emerald-700" },
];

function LinkCard({ item }: { item: LinkCardItem }) {
  const t = useTranslations("app_about_page");
  const Icon = item.icon;
  const locale = useLocale();
  const en = locale === "en";
  const [description, tags] = en ? item.en : item.zh;
  return (
    <a href={item.href} target="_blank" rel="noreferrer" className="group flex min-h-32 items-start gap-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-[0_2px_8px_rgba(15,23,42,0.08)] transition duration-200 hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-[0_7px_18px_rgba(15,23,42,0.11)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
      <span className={`grid size-12 shrink-0 place-items-center rounded-full ${item.tone}`}><Icon className="size-6" aria-hidden="true" /></span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-3"><strong className="text-base font-semibold text-neutral-800">{item.titleKey ? t(item.titleKey) : item.title}</strong><ArrowUpRight className="size-4 shrink-0 text-neutral-300 transition-colors group-hover:text-sky-600" aria-hidden="true" /></span>
        <span className="mt-1 block text-sm leading-6 text-neutral-500">{description}</span>
        <span className="mt-3 flex flex-wrap gap-1.5">{tags.map((tag) => <span key={tag} className="rounded-md bg-sky-50 px-2 py-1 text-[11px] font-medium text-sky-600">{tag}</span>)}</span>
      </span>
    </a>
  );
}

export default function AboutPage() {
  const intl = useTranslations();

  return (
    <main className="min-h-dvh bg-[#f7f7f7] px-4 py-8 text-neutral-800 sm:px-7 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between gap-4"><Link className="inline-flex min-h-11 items-center text-sm text-neutral-500 underline underline-offset-4 hover:text-neutral-800" href="/">{intl("app_about_page.backToClosureInfrastructureTerminal")}</Link><LanguageSwitch /></div>
        <section className="mt-5 rounded-2xl border border-neutral-200 bg-white px-5 py-7 shadow-sm sm:px-10 sm:py-10" aria-labelledby="about-title">
          <header className="border-b border-neutral-100 pb-7">
            <p className="text-xs font-semibold tracking-[0.16em] text-sky-600">ABOUT US</p>
            <h1 id="about-title" className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{intl("app_about_page.about")}</h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-neutral-500 sm:text-base">{intl("app_about_page.closureInfrastructureTerminalIsAnUnofficialSchedulingAssistantFor")}</p>
          </header>
          <section className="pt-8" aria-labelledby="source-title">
            <h2 id="source-title" className="text-2xl font-semibold tracking-tight">{intl("app_about_page.developmentResourcesAndDataSources")}</h2>
            <div className="mt-5 grid gap-3 md:grid-cols-2">{sources.map((item) => <LinkCard key={item.href} item={item} />)}</div>
          </section>
          <section className="mt-10 border-t border-neutral-100 pt-8" aria-labelledby="contribution-title">
            <h2 id="contribution-title" className="text-2xl font-semibold tracking-tight">{intl("app_about_page.developmentAndContributions")}</h2>
            <div className="mt-5 grid gap-3 md:grid-cols-2">{contributionCards.map((item) => <LinkCard key={item.href} item={item} />)}</div>
          </section>
          <section className="mt-10 border-t border-neutral-100 pt-8" aria-labelledby="support-title">
            <h2 id="support-title" className="text-2xl font-semibold tracking-tight">{intl("app_about_page.contributorsAndSponsors")}</h2>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div className="flex min-h-32 items-start gap-4 rounded-xl border border-dashed border-neutral-200 bg-neutral-50/70 p-4"><span className="grid size-12 shrink-0 place-items-center rounded-full bg-violet-50 text-violet-600"><UsersRound className="size-6" aria-hidden="true" /></span><div><h3 className="font-semibold">{intl("app_about_page.contributors")}</h3><p className="mt-1 text-sm leading-6 text-neutral-500">{intl("app_about_page.reservedForContributorAvatarsNamesAndContributions")}</p><span className="mt-3 inline-block rounded-md bg-neutral-100 px-2 py-1 text-[11px] text-neutral-500">{intl("app_about_page.inProgress")}</span></div></div>
              <div className="flex min-h-32 items-start gap-4 rounded-xl border border-dashed border-neutral-200 bg-neutral-50/70 p-4"><span className="grid size-12 shrink-0 place-items-center rounded-full bg-rose-50 text-rose-600"><HeartHandshake className="size-6" aria-hidden="true" /></span><div><h3 className="font-semibold">{intl("app_about_page.sponsors")}</h3><p className="mt-1 text-sm leading-6 text-neutral-500">{intl("app_about_page.reservedForSponsorNamesAvatarsAndPublicLinks")}</p><span className="mt-3 inline-block rounded-md bg-neutral-100 px-2 py-1 text-[11px] text-neutral-500">{intl("app_about_page.notOpenYet")}</span></div></div>
            </div>
          </section>
        </section>
        <footer className="flex flex-wrap items-center justify-center gap-x-5 py-5 text-xs text-neutral-500"><Link className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-neutral-800" href="/terms">{intl("app_about_page.terms")}</Link><Link className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-neutral-800" href="/privacy">{intl("app_about_page.privacy")}</Link></footer>
      </div>
    </main>
  );
}
