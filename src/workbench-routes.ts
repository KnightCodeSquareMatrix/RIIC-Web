export type AppPage = "calculator" | "manual" | "mower" | "training" | "mastery" | "skill-query" | "skland" | "account" | "settings";

export const WORKBENCH_PAGE_PATHS: Record<AppPage, string> = {
  calculator: "/",
  manual: "/manual",
  mower: "/mower",
  training: "/training",
  mastery: "/mastery",
  "skill-query": "/skills",
  skland: "/skland",
  account: "/account",
  settings: "/settings",
};

export function workbenchPageFromPathname(pathname: string): AppPage {
  if (pathname === WORKBENCH_PAGE_PATHS.manual) return "manual";
  if (pathname === WORKBENCH_PAGE_PATHS.mower) return "mower";
  if (pathname === WORKBENCH_PAGE_PATHS.training) return "training";
  if (pathname === WORKBENCH_PAGE_PATHS.mastery) return "mastery";
  if (pathname === WORKBENCH_PAGE_PATHS["skill-query"]) return "skill-query";
  if (pathname === WORKBENCH_PAGE_PATHS.skland) return "skland";
  if (pathname === WORKBENCH_PAGE_PATHS.account) return "account";
  if (pathname === WORKBENCH_PAGE_PATHS.settings) return "settings";
  return "calculator";
}

export function workbenchHref(page: AppPage): string {
  return WORKBENCH_PAGE_PATHS[page];
}
