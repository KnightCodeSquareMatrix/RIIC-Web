export const USER_SETTINGS_STORAGE_KEY = "riic-web-user-settings";
export const USER_SETTINGS_CHANGED_EVENT = "riic-user-settings-change";

export interface UserSettings {
  strictMaaOperatorOrder: boolean;
  showProgressionRecalculate: boolean;
  showManualScheduleEdit: boolean;
  showMower: boolean;
  scheduleViewControl: "tabs" | "select";
  linkShiftViewControl: boolean;
  shiftViewControl: "tabs" | "select";
  imageExportScope: "single" | "all";
  loadEnglishResources: boolean;
  skillPagination: "infinite" | "manual";
  showFeedback: boolean;
  showImages: boolean;
  allowReplacementOperatorSort: boolean;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  strictMaaOperatorOrder: true,
  showProgressionRecalculate: true,
  showManualScheduleEdit: true,
  showMower: false,
  scheduleViewControl: "tabs",
  linkShiftViewControl: true,
  shiftViewControl: "tabs",
  imageExportScope: "single",
  loadEnglishResources: true,
  skillPagination: "infinite",
  showFeedback: true,
  showImages: true,
  allowReplacementOperatorSort: false,
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function loadUserSettings(storage: StorageLike): UserSettings {
  try {
    const raw = storage.getItem(USER_SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_USER_SETTINGS };
    const value = JSON.parse(raw) as Partial<UserSettings>;
    const settings = { ...DEFAULT_USER_SETTINGS };
    for (const key of Object.keys(settings) as Array<keyof UserSettings>) {
      if (typeof settings[key] === "boolean" && typeof value[key] === "boolean") {
        Object.assign(settings, { [key]: value[key] });
      }
    }
    return {
      ...settings,
      scheduleViewControl: value.scheduleViewControl === "select" ? "select" : DEFAULT_USER_SETTINGS.scheduleViewControl,
      shiftViewControl: value.shiftViewControl === "select" ? "select" : DEFAULT_USER_SETTINGS.shiftViewControl,
      imageExportScope: value.imageExportScope === "all" ? "all" : DEFAULT_USER_SETTINGS.imageExportScope,
      skillPagination: value.skillPagination === "manual" ? "manual" : DEFAULT_USER_SETTINGS.skillPagination,
    };
  } catch {
    return { ...DEFAULT_USER_SETTINGS };
  }
}

export function persistUserSettings(storage: StorageLike, settings: UserSettings): void {
  storage.setItem(USER_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}
