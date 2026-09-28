"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AdminPageHeader, adminPageClass } from "../admin/admin-page";
import { AdminUserManagement } from "../admin/users/users-client";
import { AdminSolverMetrics } from "../admin/users/solver-metrics-client";
import { DiagnosticsPanel } from "../admin/diagnostics-panel";
import { SolverVersion } from "../admin/solver-version";
import { usePreviewAdmin } from "./preview-client";
import { Skeleton } from "@/components/ui/skeleton";

const loading = () => <div className={adminPageClass}><Skeleton className="h-64 w-full" /></div>;
const Issues = dynamic(() => import("../admin/issues/issues-client").then(module => module.AdminIssues), { loading });
const Quality = dynamic(() => import("../admin/quality/quality-client").then(module => module.QualityWorkbench), { loading });
const Skills = dynamic(() => import("../admin/skills/skill-annotations-client").then(module => module.SkillAnnotationManager), { loading });
const Changelog = dynamic(() => import("../admin/changelog/changelog-manager").then(module => module.ChangelogManager), { loading });

export function PreviewPage({ section }: { section: string }) {
  const isAdmin = usePreviewAdmin();
  const t = useTranslations("AdminWorkspace");
  if (!isAdmin && ["users", "skills", "changelog"].includes(section)) return <main id="admin-content" className={adminPageClass}><p>{t("accessDenied")}</p><Link href="/admin-preview" className="underline">{t("backOverview")}</Link></main>;
  if (section === "users") return <main id="admin-content" className={adminPageClass}><AdminPageHeader title="users" description="usersHint" /><AdminUserManagement /></main>;
  if (section === "issues") return <Issues isAdmin={isAdmin} />;
  if (section === "quality") return <><p className="px-4 pt-4 text-xs text-muted-foreground sm:px-6 lg:px-8">{t("previewReadOnly")}</p><Quality /></>;
  if (section === "skills") return <Skills />;
  if (section === "changelog") return <><p className="px-4 pt-4 text-xs text-muted-foreground sm:px-6 lg:px-8">{t("previewReadOnly")}</p><Changelog /></>;
  return <main id="admin-content" className={adminPageClass}>
    <AdminPageHeader title="overview" description="overviewHint" />
    <AdminSolverMetrics />
    <SolverVersion plannerReady={true} solverFingerprint={null} />
    <DiagnosticsPanel />
  </main>;
}
