export function loadClientFeature(key: "websiteAccountDialog"): Promise<typeof import("@/components/auth/WebsiteAccountDialog")>;
export function loadClientFeature(key: "setupDialog"): Promise<typeof import("./setup-dialog")>;
export function loadClientFeature(key: "sharedComponents"): Promise<typeof import("./components")>;
export function loadClientFeature(key: "planResultSummary"): Promise<typeof import("@/components/PlanResultSummary")>;
export function loadClientFeature(key: "operatorPortraits"): Promise<typeof import("@/operatorPortraits")>;
export function loadClientFeature(key: "compactScheduleView"): Promise<typeof import("@/components/CompactScheduleView")>;
export function loadClientFeature(key: "operatorSkillTooltip"): Promise<typeof import("@/components/OperatorSkillTooltip")>;
export function loadClientFeature(key: "schedulePortraitPreload"): Promise<typeof import("@/schedule-portrait-preload")>;
export function loadClientFeature(
  key: "websiteAccountDialog" | "setupDialog" | "sharedComponents" | "planResultSummary" | "operatorPortraits" | "compactScheduleView" | "operatorSkillTooltip" | "schedulePortraitPreload",
): Promise<unknown> {
  switch (key) {
    case "websiteAccountDialog":
      return import("@/components/auth/WebsiteAccountDialog");
    case "setupDialog":
      return import("./setup-dialog");
    case "sharedComponents":
      return import("./components");
    case "planResultSummary":
      return import("@/components/PlanResultSummary");
    case "operatorPortraits":
      return import("@/operatorPortraits");
    case "compactScheduleView":
      return import("@/components/CompactScheduleView");
    case "operatorSkillTooltip":
      return import("@/components/OperatorSkillTooltip");
    case "schedulePortraitPreload":
      return import("@/schedule-portrait-preload");
  }
}
