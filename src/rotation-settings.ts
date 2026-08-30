import type { RotationProfile } from "./types";

export type RotationOption = {
  profile: RotationProfile;
  label: string;
  durations: number[];
};

export const DEFAULT_ROTATION_PROFILE: RotationProfile = "abc_12_6_6";

export const ROTATION_OPTIONS: RotationOption[] = [
  { profile: "abc_12_6_6", label: "一天三换", durations: [12, 6, 6] },
  { profile: "main_backup_12_12", label: "主备轮换", durations: [12, 12] },
  { profile: "abc_12_12_12", label: "一天两换", durations: [12, 12, 12] },
];

// 菲亚梅塔轮换与深海猎人轮换不再出现在选择器中，但后端仍支持这两个 profile；
// 保留在受支持集合里，旧会话恢复与已生成结果不会因此被改写或回退。
export const LEGACY_ROTATION_PROFILES: RotationProfile[] = [
  "fiammetta_8_8_4_4",
  "abyssal_7_5_7_5",
];

const SUPPORTED_ROTATION_PROFILES: RotationProfile[] = [
  ...ROTATION_OPTIONS.map(({ profile }) => profile),
  ...LEGACY_ROTATION_PROFILES,
];

export function isRotationProfile(value: unknown): value is RotationProfile {
  return typeof value === "string" && SUPPORTED_ROTATION_PROFILES.includes(value as RotationProfile);
}

export function normalizeRotationProfile(value: unknown): RotationProfile {
  return isRotationProfile(value) ? value : DEFAULT_ROTATION_PROFILE;
}

export function rotationOption(profile: RotationProfile): RotationOption {
  return ROTATION_OPTIONS.find((option) => option.profile === profile) ?? ROTATION_OPTIONS[0];
}
