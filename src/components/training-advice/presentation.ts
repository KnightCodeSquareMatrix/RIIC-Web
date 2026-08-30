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

const STATE_LABELS: Record<TrainingAdviceCombinationState, string> = {
  complete: "已完成",
  needs_training: "需培养",
  missing_core: "缺失核心",
  missing_important: "缺失重要",
  needs_review: "待核对",
};

const MEMBER_PROGRESS_LABELS: Record<TrainingAdviceMemberProgress, string> = {
  ready: "就绪",
  missing: "缺失",
  owned_needs_training: "需培养",
  needs_review: "待核对",
};

const MEMBER_ROLE_LABELS: Record<TrainingAdviceMemberRole, string> = {
  core: "核心",
  important: "重要",
  secondary: "次级",
  hanger: "挂件",
};

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

const REASON_LABELS: Record<TrainingAdviceReason, string> = {
  newbie_required: "新手必需",
  combination_core: "组合核心",
  combination_important: "组合重要",
  standalone: "独立推荐",
};

const ACQUISITION_LABELS: Record<TrainingAdviceAcquisitionKind, string> = {
  shop: "商店",
  public_recruitment: "公开招募",
  event: "活动",
  redeem_code: "兑换码",
  integrated_strategy: "集成战略",
};

const CONDITION_STATUS_LABELS: Record<TrainingAdviceConditionEvaluation["status"], string> = {
  satisfied: "已满足",
  unsatisfied: "未满足",
  unknown: "待确认",
};

export function trainingProductLabel(product?: TrainingAdviceProduct): string {
  return product ? PRODUCT_LABELS[product] : "综合";
}

export function trainingProductGroup(product?: TrainingAdviceProduct): string {
  return product === "trade" ? "trading" : "manufacture";
}

export function trainingScaleLabel(scale?: TrainingCombination["scale"]): string {
  if (scale === "system") return "体系组合";
  if (scale === "small") return "小型组合";
  return scale ?? "—";
}

export function trainingFacilityLabel(facility: string): string {
  return FACILITY_LABELS[facility] ?? facility;
}

export function trainingCombinationStateLabel(state?: TrainingAdviceCombinationState): string {
  return state ? STATE_LABELS[state] : "未知";
}

export function trainingLevelText(target?: TrainingAdviceTarget | TrainingAdviceState): string {
  if (!target) return "—";
  if ("kind" in target) {
    if (target.kind === "no_requirement") return "无需额外培养";
    if (target.kind === "derive_from_skill_binding") return "按技能解锁要求";
    if (target.kind === "needs_review") return "目标待核对";
  }
  if (typeof target.elite !== "number") return "—";
  return target.level ? `精${target.elite} Lv${target.level}` : `精${target.elite}`;
}

export function trainingMemberProgressLabel(progress?: TrainingAdviceMemberProgress): string {
  return progress ? MEMBER_PROGRESS_LABELS[progress] : "未知";
}

export function trainingMemberRoleLabel(role?: TrainingAdviceMemberRole): string {
  return role ? MEMBER_ROLE_LABELS[role] : "—";
}

export function trainingPriorityLabel(priority?: TrainingAdvicePriority): string {
  return priority ? PRIORITY_LABELS[priority] : "基础目标";
}

export function trainingReasonLabel(reason?: TrainingAdviceReason): string {
  return reason ? REASON_LABELS[reason] : "基础目标";
}

export function trainingAcquisitionLabel(kind: TrainingAdviceAcquisitionKind): string {
  return ACQUISITION_LABELS[kind];
}

export function trainingConditionStatusLabel(status: TrainingAdviceConditionEvaluation["status"]): string {
  return CONDITION_STATUS_LABELS[status];
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
