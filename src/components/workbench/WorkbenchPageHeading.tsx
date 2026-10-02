import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";
import type { AppPage } from "@/workbench-routes";

// Match sidebar categories by default; a persona can override its own page accent.
const CATEGORY_ACCENTS = {
  scheduling: "#FFD800",
  progression: "#B8F03A",
  skills: "#22BBFF",
  personal: "#C084FC",
  assistant: "#FFD800",
} as const;

const PAGE_CATEGORIES: Record<AppPage, keyof typeof CATEGORY_ACCENTS> = {
  calculator: "scheduling",
  manual: "scheduling",
  mower: "scheduling",
  training: "scheduling",
  "account-health": "progression",
  mastery: "progression",
  recruitment: "progression",
  inventory: "progression",
  "skill-query": "skills",
  skland: "personal",
  account: "personal",
  billing: "personal",
  settings: "personal",
  agent: "assistant",
};

export function WorkbenchHeadingAccent({ page, color }: { page: AppPage; color?: string }) {
  return <span
    className="h-6 w-1.5 shrink-0"
    style={{ backgroundColor: color ?? CATEGORY_ACCENTS[PAGE_CATEGORIES[page]] }}
    aria-hidden="true"
  />;
}

export function WorkbenchPageHeading({ page, accentColor, className, children, ...props }: ComponentProps<"h1"> & { page: AppPage; accentColor?: string }) {
  return <h1 className={cn("flex min-w-0 items-center gap-2.5 text-lg font-semibold text-foreground", className)} {...props}>
    <WorkbenchHeadingAccent page={page} color={accentColor} />
    <span className="min-w-0 truncate">{children}</span>
  </h1>;
}
