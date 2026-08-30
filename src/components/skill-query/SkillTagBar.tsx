"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

// 与房间筛选栏保持同一套选中态样式。
const SELECTED_TAG_CLASS =
  "aria-pressed:border-[#FFD800] aria-pressed:bg-[#FFD800] aria-pressed:text-[#313131] aria-pressed:hover:bg-[#FFD800] aria-pressed:hover:text-[#313131]";

interface SkillTagBarProps {
  /** 当前房间下可选的标签列表。 */
  tags: readonly string[];
  selected: string | null;
  onChange: (next: string | null) => void;
}

/** 二级标签筛选栏：单选，不选则不做标签条件。 */
export function SkillTagBar({ tags, selected, onChange }: SkillTagBarProps) {
  if (tags.length === 0) return null;
  return (
    <div className="mt-2" aria-label="技能标签筛选">
      <div className="mb-1.5 text-xs font-medium text-muted-foreground">技能标签</div>
      <ToggleGroup
        value={selected ? [selected] : []}
        onValueChange={(next) => onChange((next[0] as string | undefined) ?? null)}
        variant="outline"
        size="sm"
        spacing={2}
        aria-label="技能标签筛选"
        className="w-full flex-wrap"
      >
        {tags.map((tag) => (
          <ToggleGroupItem
            key={tag}
            value={tag}
            aria-label={`筛选${tag}`}
            className={SELECTED_TAG_CLASS}
          >
            {tag}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
