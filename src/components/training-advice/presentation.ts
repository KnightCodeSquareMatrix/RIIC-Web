import type {
  TrainingAdviceAcquisitionKind,
  TrainingAdviceCombinationState,
  TrainingAdviceConditionEvaluation,
  TrainingAdviceMemberProgress,
  TrainingAdviceMemberRole,
  TrainingAdvicePriority,
  TrainingAdviceProduct,
  TrainingAdviceReason,
  TrainingAdviceState,
  TrainingAdviceTarget,
  TrainingCombination,
  TrainingRecommendation,
} from "@/types";

const PRODUCT_LABELS: Record<TrainingAdviceProduct, string> = {
  trade: "贸易",
  gold: "赤金",
  experience: "作战记录",
  general_manufacturing: "制造",
  originium_shards: "源石碎片",
};
const PRODUCT_LABELS_EN: Record<TrainingAdviceProduct, string> = { trade: "Trading", gold: "Pure Gold", experience: "Battle Records", general_manufacturing: "Manufacturing", originium_shards: "Originium Shards" };

const FACILITY_LABELS: Record<string, string> = {
  trade_station: "贸易站",
  manufacturing_station: "制造站",
  power_station: "发电站",
  control_center: "控制中枢",
  dormitory: "宿舍",
  meeting_room: "会客室",
  office: "办公室",
  training_room: "训练室",
  workshop: "加工站",
};
const FACILITY_LABELS_EN: Record<string, string> = { trade_station: "Trading Post", manufacturing_station: "Factory", power_station: "Power Plant", control_center: "Control Center", dormitory: "Dormitory", meeting_room: "Reception Room", office: "Office", training_room: "Training Room", workshop: "Workshop" };

const STATE_LABELS: Record<TrainingAdviceCombinationState, string> = {
  complete: "已完成",
  needs_training: "需培养",
  missing_core: "缺失核心",
  missing_important: "缺失重要",
  needs_review: "待核对",
};
const STATE_LABELS_EN: Record<TrainingAdviceCombinationState, string> = { complete: "Complete", needs_training: "Needs training", missing_core: "Missing core", missing_important: "Missing key member", needs_review: "Needs review" };

const MEMBER_PROGRESS_LABELS: Record<TrainingAdviceMemberProgress, string> = {
  ready: "就绪",
  missing: "缺失",
  owned_needs_training: "需培养",
  needs_review: "待核对",
};
const MEMBER_PROGRESS_LABELS_EN: Record<TrainingAdviceMemberProgress, string> = { ready: "Ready", missing: "Missing", owned_needs_training: "Needs training", needs_review: "Needs review" };

const MEMBER_ROLE_LABELS: Record<TrainingAdviceMemberRole, string> = {
  core: "核心",
  important: "重要",
  secondary: "次级",
  hanger: "挂件",
};
const MEMBER_ROLE_LABELS_EN: Record<TrainingAdviceMemberRole, string> = { core: "Core", important: "Important", secondary: "Secondary", hanger: "Support" };

const PRIORITY_LABELS: Record<TrainingAdvicePriority, string> = {
  newbie_four_star_elite_one: "四星精一",
  flagship_newbie: "新手主力",
  other_newbie: "新手补充",
  owned_tailor: "已拥有裁缝",
  automation_must_train: "自动化必练",
  small_high_efficiency_core: "高效小组核心",
  small_high_efficiency_important: "高效小组重要",
  system_single_core_gap: "体系单核缺口",
  other_important: "其他重要",
  lower_priority_core: "次优先核心",
  high_efficiency_standalone: "高效单卡",
};
const PRIORITY_LABELS_EN: Record<TrainingAdvicePriority, string> = { newbie_four_star_elite_one: "4★ Elite 1", flagship_newbie: "Beginner flagship", other_newbie: "Beginner support", owned_tailor: "Owned fit", automation_must_train: "Automation essential", small_high_efficiency_core: "Efficient team core", small_high_efficiency_important: "Efficient key member", system_single_core_gap: "Missing system core", other_important: "Other important", lower_priority_core: "Lower-priority core", high_efficiency_standalone: "Efficient standalone" };

const REASON_LABELS: Record<TrainingAdviceReason, string> = {
  newbie_required: "新手必需",
  combination_core: "组合核心",
  combination_important: "组合重要",
  standalone: "独立推荐",
};
const REASON_LABELS_EN: Record<TrainingAdviceReason, string> = { newbie_required: "Beginner essential", combination_core: "Combination core", combination_important: "Combination key", standalone: "Standalone" };

const ACQUISITION_LABELS: Record<TrainingAdviceAcquisitionKind, string> = {
  shop: "商店",
  public_recruitment: "公开招募",
  event: "活动",
  redeem_code: "兑换码",
  integrated_strategy: "集成战略",
};
const ACQUISITION_LABELS_EN: Record<TrainingAdviceAcquisitionKind, string> = { shop: "Shop", public_recruitment: "Recruitment", event: "Event", redeem_code: "Redemption code", integrated_strategy: "Integrated Strategies" };

const CONDITION_STATUS_LABELS: Record<TrainingAdviceConditionEvaluation["status"], string> = {
  satisfied: "已满足",
  unsatisfied: "未满足",
  unknown: "待确认",
};
const CONDITION_STATUS_LABELS_EN: Record<TrainingAdviceConditionEvaluation["status"], string> = { satisfied: "Satisfied", unsatisfied: "Not satisfied", unknown: "To confirm" };

export function trainingProductLabel(product?: TrainingAdviceProduct, en = false): string {
  return product ? (en ? PRODUCT_LABELS_EN : PRODUCT_LABELS)[product] : (en ? "General" : "综合");
}

export function trainingProductGroup(product?: TrainingAdviceProduct): string {
  return product === "trade" ? "trading" : "manufacture";
}

export function trainingScaleLabel(scale?: TrainingCombination["scale"], en = false): string {
  if (scale === "system") return en ? "System combination" : "体系组合";
  if (scale === "small") return en ? "Small combination" : "小型组合";
  return scale ?? "—";
}

export function trainingFacilityLabel(facility: string, en = false): string {
  return (en ? FACILITY_LABELS_EN : FACILITY_LABELS)[facility] ?? facility;
}

export function trainingCombinationStateLabel(state?: TrainingAdviceCombinationState, en = false): string {
  return state ? (en ? STATE_LABELS_EN : STATE_LABELS)[state] : (en ? "Unknown" : "未知");
}

export function trainingLevelText(target?: TrainingAdviceTarget | TrainingAdviceState, en = false): string {
  if (!target) return "—";
  if ("kind" in target) {
    if (target.kind === "no_requirement") return en ? "No additional training" : "无需额外培养";
    if (target.kind === "derive_from_skill_binding") return en ? "Use skill unlock requirement" : "按技能解锁要求";
    if (target.kind === "needs_review") return en ? "Target needs review" : "目标待核对";
  }
  if (typeof target.elite !== "number") return "—";
  return target.level ? `${en ? "Elite" : "精"}${target.elite} Lv${target.level}` : `${en ? "Elite" : "精"}${target.elite}`;
}

export function trainingMemberProgressLabel(progress?: TrainingAdviceMemberProgress, en = false): string {
  return progress ? (en ? MEMBER_PROGRESS_LABELS_EN : MEMBER_PROGRESS_LABELS)[progress] : (en ? "Unknown" : "未知");
}

export function trainingMemberRoleLabel(role?: TrainingAdviceMemberRole, en = false): string {
  return role ? (en ? MEMBER_ROLE_LABELS_EN : MEMBER_ROLE_LABELS)[role] : "—";
}

export function trainingPriorityLabel(priority?: TrainingAdvicePriority, en = false): string {
  return priority ? (en ? PRIORITY_LABELS_EN : PRIORITY_LABELS)[priority] : (en ? "Basic goal" : "基础目标");
}

export function trainingReasonLabel(reason?: TrainingAdviceReason, en = false): string {
  return reason ? (en ? REASON_LABELS_EN : REASON_LABELS)[reason] : (en ? "Basic goal" : "基础目标");
}

export function trainingAcquisitionLabel(kind: TrainingAdviceAcquisitionKind, en = false): string {
  return (en ? ACQUISITION_LABELS_EN : ACQUISITION_LABELS)[kind];
}

export function trainingConditionStatusLabel(status: TrainingAdviceConditionEvaluation["status"], en = false): string {
  return (en ? CONDITION_STATUS_LABELS_EN : CONDITION_STATUS_LABELS)[status];
}

export function sortTrainingCombinations(
  combinations: readonly TrainingCombination[],
): TrainingCombination[] {
  return [...combinations];
}

export function sortTrainingRecommendations(
  recommendations: readonly TrainingRecommendation[],
): TrainingRecommendation[] {
  return [...recommendations];
}
