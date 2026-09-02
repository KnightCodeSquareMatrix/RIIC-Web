"use client";

import Link from "next/link";
import { Bug, Gauge, House, UsersRound } from "lucide-react";
import { usePathname } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/admin", label: "运行概览", icon: Gauge },
  { href: "/admin/issues", label: "求解器问题", icon: Bug },
  { href: "/admin/users", label: "用户管理", icon: UsersRound },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="管理后台导航" className="flex min-w-0 items-center gap-1 overflow-x-auto">
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
            {item.label}
          </Link>
        );
      })}
      <Link
        href="/"
        data-motion-pressable=""
        className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "shrink-0 text-muted-foreground")}
      >
        <House aria-hidden="true" />
        返回排班助手
      </Link>
    </nav>
  );
}
