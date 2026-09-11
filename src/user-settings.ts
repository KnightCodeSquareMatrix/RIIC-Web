export const USER_SETTINGS_STORAGE_KEY = "riic-web-user-settings";

export interface UserSettings {
  strictMaaOperatorOrder: boolean;
  showProgressionRecalculate: boolean;
  showManualScheduleEdit: boolean;
  scheduleViewControl: "tabs" | "select";
  linkShiftViewControl: boolean;
  shiftViewControl: "tabs" | "select";
  imageExportScope: "single" | "all";
  loadEnglishResources: boolean;
  skillPagination: "infinite" | "manual";
  showFeedback: boolean;
  showImages: boolean;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  strictMaaOperatorOrder: true,
  showProgressionRecalculate: true,
  showManualScheduleEdit: true,
  scheduleViewControl: "tabs",
  linkShiftViewControl: true,
  shiftViewControl: "tabs",
  imageExportScope: "single",
  loadEnglishResources: true,
  skillPagination: "infinite",
  showFeedback: true,
  showImages: true,
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function loadUserSettings(storage: StorageLike): UserSettings {
  try {
    const raw = storage.getItem(USER_SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_USER_SETTINGS };
    const value = JSON.parse(raw) as Partial<UserSettings>;
    return {
      strictMaaOperatorOrder: typeof value.strictMaaOperatorOrder === "boolean"
        ? value.strictMaaOperatorOrder
        : DEFAULT_USER_SETTINGS.strictMaaOperatorOrder,
      showProgressionRecalculate: typeof value.showProgressionRecalculate === "boolean"
        ? value.showProgressionRecalculate
        : DEFAULT_USER_SETTINGS.showProgressionRecalculate,
      showManualScheduleEdit: typeof value.showManualScheduleEdit === "boolean"
        ? value.showManualScheduleEdit
        : DEFAULT_USER_SETTINGS.showManualScheduleEdit,
      scheduleViewControl: value.scheduleViewControl === "select" ? "select" : DEFAULT_USER_SETTINGS.scheduleViewControl,
      linkShiftViewControl: typeof value.linkShiftViewControl === "boolean"
        ? value.linkShiftViewControl
        : DEFAULT_USER_SETTINGS.linkShiftViewControl,
      shiftViewControl: value.shiftViewControl === "select" ? "select" : DEFAULT_USER_SETTINGS.shiftViewControl,
      imageExportScope: value.imageExportScope === "all" ? "all" : DEFAULT_USER_SETTINGS.imageExportScope,
      loadEnglishResources: typeof value.loadEnglishResources === "boolean" ? value.loadEnglishResources : DEFAULT_USER_SETTINGS.loadEnglishResources,
      skillPagination: value.skillPagination === "manual" ? "manual" : DEFAULT_USER_SETTINGS.skillPagination,
      showFeedback: typeof value.showFeedback === "boolean" ? value.showFeedback : DEFAULT_USER_SETTINGS.showFeedback,
      showImages: typeof value.showImages === "boolean" ? value.showImages : DEFAULT_USER_SETTINGS.showImages,
    };
  } catch {
    return { ...DEFAULT_USER_SETTINGS };
  }
}

export function persistUserSettings(storage: StorageLike, settings: UserSettings): void {
  storage.setItem(USER_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}
