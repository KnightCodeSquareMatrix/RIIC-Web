"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useLanguageDemo } from "@/language-demo";

// 与房间筛选栏保持同一套选中态样式。
const SELECTED_TAG_CLASS =
  "aria-pressed:border-[#FFD800] aria-pressed:bg-[#FFD800] aria-pressed:text-[#313131] aria-pressed:hover:bg-[#FFD800] aria-pressed:hover:text-[#313131]";

const ENGLISH_SKILL_TAGS: Record<string, string> = {
  "生产力": "Productivity", "订单效率": "Order Efficiency", "办公室": "HR Office", "线索倾向": "Clue Bias", "线索搜集": "Clue Search", "心情消耗": "Morale Cost",
  "贵金属": "Pure Gold", "作战记录": "Battle Records", "源石": "Originium", "通用生产": "General Production", "仓库容量": "Capacity",
  "订单上限": "Order Limit", "特殊订单": "Special Orders", "高品质": "High-quality Orders",
  "单体恢复": "Single-target Recovery", "群体恢复": "Group Recovery", "特殊恢复": "Special Recovery", "自身恢复": "Self Recovery",
  "联络速度": "Contact Speed", "特殊加成": "Special Bonus",
  "未拥有加成": "Missing Clue Bonus", "无特别加成": "No Special Bonus",
  "线索1": "Clue 1", "线索2": "Clue 2", "线索3": "Clue 3", "线索4": "Clue 4", "线索5": "Clue 5", "线索6": "Clue 6", "线索7": "Clue 7",
  "全能": "All Classes", "减半": "Time Reduction", "辅助": "Supporter", "近卫": "Guard", "狙击": "Sniper", "术师": "Caster", "特种": "Specialist", "先锋": "Vanguard", "医疗": "Medic", "重装": "Defender",
  "精英材料": "Elite Materials", "技巧概要": "Skill Summaries", "基建材料": "Base Materials", "芯片": "Chips", "任意材料": "Any Material",
};

interface SkillTagBarProps {
  /** 当前房间下可选的标签列表。 */
  tags: readonly string[];
  selected: string | null;
  onChange: (next: string | null) => void;
}

/** 二级标签筛选栏：单选，不选则不做标签条件。 */
export function SkillTagBar({ tags, selected, onChange }: SkillTagBarProps) {
  const { locale } = useLanguageDemo();
  const en = locale === "en";
  if (tags.length === 0) return null;
  return (
    <div className="mt-2" aria-label={en ? "Skill tag filters" : "技能标签筛选"}>
      <div className="mb-1.5 text-xs font-medium text-muted-foreground">{en ? "Skill tags" : "技能标签"}</div>
      <ToggleGroup
        value={selected ? [selected] : []}
        onValueChange={(next) => onChange((next[0] as string | undefined) ?? null)}
        variant="outline"
        size="sm"
        spacing={2}
        aria-label={en ? "Skill tag filters" : "技能标签筛选"}
        className="w-full flex-wrap"
      >
        {tags.map((tag) => (
          <ToggleGroupItem
            key={tag}
            value={tag}
            aria-label={en ? `Filter ${ENGLISH_SKILL_TAGS[tag] ?? tag}` : `筛选${tag}`}
            className={SELECTED_TAG_CLASS}
          >
            {en ? ENGLISH_SKILL_TAGS[tag] ?? tag : tag}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
