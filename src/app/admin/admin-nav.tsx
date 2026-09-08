"use client";
import { useTranslations, useLocale } from "next-intl";
import { messageRecord } from "@/i18n/translate";

import Link from "next/link";
import { BookOpen, Bug, FlaskConical, Gauge, House, MessageSquareText, UsersRound } from "lucide-react";
import { usePathname } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/admin", zh: messageRecord("zh", "app_admin_admin_nav_content").value, en: messageRecord("en", "app_admin_admin_nav_content").value, icon: Gauge },
  { href: "/admin/skills", zh: messageRecord("zh", "app_admin_admin_nav_content2").value, en: messageRecord("en", "app_admin_admin_nav_content2").value, icon: MessageSquareText },
  { href: "/admin/changelog", zh: messageRecord("zh", "app_admin_admin_nav_content5").value, en: messageRecord("en", "app_admin_admin_nav_content5").value, icon: BookOpen },
  { href: "/admin/issues", zh: messageRecord("zh", "app_admin_admin_nav_content3").value, en: messageRecord("en", "app_admin_admin_nav_content3").value, icon: Bug },
  { href: "/admin/quality", zh: "复现测试", en: "Reproduction tests", icon: FlaskConical },
  { href: "/admin/users", zh: messageRecord("zh", "app_admin_admin_nav_content4").value, en: messageRecord("en", "app_admin_admin_nav_content4").value, icon: UsersRound },
] as const;

export function AdminNav({ isAdmin }: { isAdmin: boolean }) {
  const intl = useTranslations();
  const pathname = usePathname();
  const locale = useLocale();
  const en = locale === "en";
  return (
    <nav aria-label={intl("app_admin_admin_nav.administrationNavigation")} className="flex min-w-0 items-center gap-1 overflow-x-auto">
      {ITEMS.filter((item) => isAdmin || item.href === "/admin" || item.href === "/admin/issues" || item.href === "/admin/quality").map((item) => {
        const active = item.href === "/admin"
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            data-motion-pressable=""
            className={cn(buttonVariants({ variant: active ? "secondary" : "ghost", size: "lg" }), "shrink-0")}
          >
            <Icon aria-hidden="true" />
            {en ? item.en : item.zh}
          </Link>
        );
      })}
      <Link
        href="/"
        data-motion-pressable=""
        className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "shrink-0 text-muted-foreground")}
      >
        <House aria-hidden="true" />
        {intl("app_admin_admin_nav.backToScheduler")}
      </Link>
    </nav>
  );
}
