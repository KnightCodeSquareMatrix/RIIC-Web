export type AppPage = "calculator" | "training" | "skill-query" | "skland" | "account";

export const WORKBENCH_PAGE_PATHS: Record<AppPage, string> = {
  calculator: "/",
  training: "/training",
  "skill-query": "/skills",
  skland: "/skland",
  account: "/account",
};

export function workbenchPageFromPathname(pathname: string): AppPage {
  if (pathname === WORKBENCH_PAGE_PATHS.training) return "training";
  if (pathname === WORKBENCH_PAGE_PATHS["skill-query"]) return "skill-query";
  if (pathname === WORKBENCH_PAGE_PATHS.skland) return "skland";
  if (pathname === WORKBENCH_PAGE_PATHS.account) return "account";
  return "calculator";
}

export function workbenchHref(page: AppPage): string {
  return WORKBENCH_PAGE_PATHS[page];
}
