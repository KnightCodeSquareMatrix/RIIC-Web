"use client";

import {
  Calculator,
  BookOpen,
  CircleHelp,
  Cloud,
  GraduationCap,
  Search,
  SquarePen,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { workbenchHref, type AppPage } from "@/workbench-routes";
import { useLanguageDemo } from "@/language-demo";

const CLIENT_SKLAND_ENABLED = process.env.APP_CLIENT_SKLAND_ENABLED === "1";

interface AppSidebarProps {
  page: AppPage;
  onPageChange: (page: AppPage, trigger?: HTMLElement) => boolean;
}

interface AppNavigationItemProps extends AppSidebarProps {
  target: AppPage;
  label: string;
  icon: LucideIcon;
}

function AppNavigationItem({
  page,
  target,
  label,
  icon: Icon,
  onPageChange,
}: AppNavigationItemProps) {
  const { isMobile, setOpenMobile } = useSidebar();
  const href = workbenchHref(target);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={(
          <Link
            href={href}
            role="button"
            aria-current={page === target ? "page" : undefined}
            data-primary-navigation-page={target}
            onClick={(event) => {
              if (!onPageChange(target, event.currentTarget)) event.preventDefault();
              if (isMobile) setOpenMobile(false);
            }}
          />
        )}
        isActive={page === target}
        tooltip={label}
      >
        <Icon className="size-5" />
        <span>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AppSidebar({ page, onPageChange }: AppSidebarProps) {
  const { locale } = useLanguageDemo();
  const labels = locale === "en" ? {
    calculator: "Infrastructure Calculator",
    manual: "Manual Scheduling",
    training: "Training Advice",
    mastery: "Mastery Planner",
    skills: "Skill Search",
    skland: "Skland Status",
    account: "Account",
    help: "Help",
  } : {
    calculator: "基建计算器",
    manual: "手动排班",
    training: "练卡建议",
    mastery: "专精规划",
    skills: "技能查询",
    skland: "森空岛状态中心",
    account: "账号管理",
    help: "使用帮助",
  };
  return (
    <Sidebar collapsible="icon" data-primary-navigation-prefetch="eager">
      <SidebarHeader className="h-[65px] flex-row items-center justify-end border-b border-sidebar-border px-2 group-data-[collapsible=icon]:justify-center">
        <SidebarTrigger className="h-9 w-9" />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <AppNavigationItem page={page} target="calculator" label={labels.calculator} icon={Calculator} onPageChange={onPageChange} />
            <AppNavigationItem page={page} target="manual" label={labels.manual} icon={SquarePen} onPageChange={onPageChange} />
            <AppNavigationItem page={page} target="training" label={labels.training} icon={GraduationCap} onPageChange={onPageChange} />
            <AppNavigationItem page={page} target="mastery" label={labels.mastery} icon={BookOpen} onPageChange={onPageChange} />
            <AppNavigationItem page={page} target="skill-query" label={labels.skills} icon={Search} onPageChange={onPageChange} />
            {CLIENT_SKLAND_ENABLED ? (
              <AppNavigationItem page={page} target="skland" label={labels.skland} icon={Cloud} onPageChange={onPageChange} />
            ) : null}
            <AppNavigationItem page={page} target="account" label={labels.account} icon={UserRound} onPageChange={onPageChange} />
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link href="/changelog" data-changelog-link />}
              tooltip={locale === "en" ? "Changelog" : "更新日志"}
            >
              <BookOpen className="size-5" />
              <span>{locale === "en" ? "Changelog" : "更新日志"}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link href="/help" data-help-link />}
              tooltip={labels.help}
            >
              <CircleHelp className="size-5" />
              <span>{labels.help}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
