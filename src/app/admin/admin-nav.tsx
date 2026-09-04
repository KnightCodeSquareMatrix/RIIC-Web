"use client";

import Link from "next/link";
import { Bug, Gauge, House, MessageSquareText, UsersRound } from "lucide-react";
import { usePathname } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLanguageDemo } from "@/language-demo";

const ITEMS = [
  { href: "/admin", zh: "运行概览", en: "Overview", icon: Gauge },
  { href: "/admin/skills", zh: "技能注释", en: "Skill notes", icon: MessageSquareText },
  { href: "/admin/issues", zh: "求解器问题", en: "Solver issues", icon: Bug },
  { href: "/admin/users", zh: "用户管理", en: "Users", icon: UsersRound },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  const { locale } = useLanguageDemo();
  const en = locale === "en";
  return (
    <nav aria-label={en ? "Administration navigation" : "管理后台导航"} className="flex min-w-0 items-center gap-1 overflow-x-auto">
      {ITEMS.map((item) => {
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
        {en ? "Back to scheduler" : "返回排班助手"}
      </Link>
    </nav>
  );
}
