"use client";

import {
  BUILDING_ROOM_LABELS,
  BUILDING_ROOM_PREFIXES,
  type BuildingRoomPrefix,
} from "@/building-rooms";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useLanguageDemo } from "@/language-demo";

interface SkillRoomTagBarProps {
  selected: BuildingRoomPrefix | null;
  onChange: (next: BuildingRoomPrefix | null) => void;
}

// 选中态：黄色填充 + 深色文字 + 黄色描边，与未选中的描边态拉开对比。
// Base UI 的 Toggle 用 aria-pressed（不是 data-state=on），所以用 aria-pressed: 前缀；
// hover 时也保持选中色，避免被 toggleVariants 的 hover:bg-muted 覆盖。
const SELECTED_TAG_CLASS =
  "aria-pressed:border-[#FFD800] aria-pressed:bg-[#FFD800] aria-pressed:text-[#313131] aria-pressed:hover:bg-[#FFD800] aria-pressed:hover:text-[#313131]";

export function SkillRoomTagBar({ selected, onChange }: SkillRoomTagBarProps) {
  const { locale } = useLanguageDemo();
  const en = locale === "en";
  const englishLabels: Partial<Record<BuildingRoomPrefix, string>> = {
    control: "Control Center", power: "Power Plant", manu: "Factory", trade: "Trading Post",
    dorm: "Dormitory", hire: "Office", meet: "Reception Room", train: "Training Room", workshop: "Workshop",
  };
  return (
    <div aria-label={en ? "Room filters" : "房间筛选"}>
      <div className="mb-1.5 text-xs font-medium text-muted-foreground">{en ? "Facility" : "工作房间"}</div>
      <ToggleGroup
        value={selected ? [selected] : []}
        onValueChange={(next) => onChange((next[0] as BuildingRoomPrefix | undefined) ?? null)}
        variant="outline"
        size="sm"
        spacing={2}
        aria-label={en ? "Facility filters" : "房间筛选"}
        className="w-full flex-wrap"
      >
        {BUILDING_ROOM_PREFIXES.map((prefix) => (
          <ToggleGroupItem
            key={prefix}
            value={prefix}
            aria-label={en ? `Filter ${englishLabels[prefix] ?? BUILDING_ROOM_LABELS[prefix]}` : `筛选${BUILDING_ROOM_LABELS[prefix]}`}
            className={SELECTED_TAG_CLASS}
          >
            {en ? englishLabels[prefix] ?? BUILDING_ROOM_LABELS[prefix] : BUILDING_ROOM_LABELS[prefix]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
