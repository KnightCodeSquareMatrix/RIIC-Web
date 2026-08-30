"use client";

import type { ReactElement } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RichTextStatic } from "@/components/RichTextStatic";
import {
  BUILDING_SKILL_ENHANCED_WORD,
  buildingSkillUnlockLabel,
  buildingSkillUnlockPrefix,
  operatorBuildingSkillList,
  type BuildingSkillPresentation,
} from "@/operatorPortraits";

/**
 * 悬停干员头像框时展示该干员全部基建技能的 tooltip。
 * trigger 直接复用干员卡片的头像框元素（有真实盒子），tooltip 固定出现在头像框上边缘中间。
 */
export function OperatorSkillTooltip({ name, trigger }: { name: string; trigger: ReactElement }) {
  const skills = operatorBuildingSkillList(name);
  if (skills.length === 0) return trigger; // 未知干员：原样渲染，不包 Tooltip

  return (
    <Tooltip>
      <TooltipTrigger render={trigger} />
      <TooltipContent
        side="top"
        align="center"
        className="max-w-md flex-col items-start gap-2 whitespace-normal px-3 py-2.5 text-left leading-relaxed"
      >
        {skills.map((skill) => (
          <SkillBlock key={skill.id} skill={skill} />
        ))}
      </TooltipContent>
    </Tooltip>
  );
}

function SkillBlock({ skill }: { skill: BuildingSkillPresentation }) {
  return (
    <div className="min-w-0">
      <span className="flex items-center gap-1.5 font-semibold">
        <img src={skill.icon} alt="" aria-hidden="true" className="size-7 shrink-0 object-contain" />
        <span>{skill.name}</span>
      </span>
      <span className="mt-1 block text-background/72">
        {skill.enhanced ? (
          <>
            <span>{buildingSkillUnlockPrefix(skill.elite, skill.level)}</span>
            <span className="text-[#22BBFF]">{BUILDING_SKILL_ENHANCED_WORD}</span>
          </>
        ) : (
          buildingSkillUnlockLabel(skill.elite, skill.level)
        )}
      </span>
      <span className="mt-1 block">
        {skill.descriptionRich ? <RichTextStatic text={skill.descriptionRich} /> : skill.description}
      </span>
    </div>
  );
}
