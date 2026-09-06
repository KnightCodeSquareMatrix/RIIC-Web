export type AppPage = "calculator" | "manual" | "training" | "mastery" | "skill-query" | "skland" | "account";

export const WORKBENCH_PAGE_PATHS: Record<AppPage, string> = {
  calculator: "/",
  manual: "/manual",
  training: "/training",
  mastery: "/mastery",
  "skill-query": "/skills",
  skland: "/skland",
  account: "/account",
};

export function workbenchPageFromPathname(pathname: string): AppPage {
  if (pathname === WORKBENCH_PAGE_PATHS.manual) return "manual";
  if (pathname === WORKBENCH_PAGE_PATHS.training) return "training";
  if (pathname === WORKBENCH_PAGE_PATHS.mastery) return "mastery";
  if (pathname === WORKBENCH_PAGE_PATHS["skill-query"]) return "skill-query";
  if (pathname === WORKBENCH_PAGE_PATHS.skland) return "skland";
  if (pathname === WORKBENCH_PAGE_PATHS.account) return "account";
  return "calculator";
}

export function workbenchHref(page: AppPage): string {
  return WORKBENCH_PAGE_PATHS[page];
}
