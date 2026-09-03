"use client";

import { cloneElement, useEffect, useState, type KeyboardEventHandler, type MouseEventHandler, type ReactElement } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RichTextHoverTerms } from "@/components/RichTextInteractive";
import {
  BUILDING_SKILL_ENHANCED_WORD,
  buildingSkillUnlockLabel,
  buildingSkillUnlockLabelEnglish,
  buildingSkillUnlockPrefix,
  operatorBuildingSkillList,
  type BuildingSkillPresentation,
} from "@/operatorPortraits";
import { demoBuildingSkill, useLanguageDemo } from "@/language-demo";
import { cn } from "@/lib/utils";

/**
 * 悬停干员头像框时展示该干员全部基建技能的 tooltip。
 * trigger 直接复用干员卡片的头像框元素（有真实盒子），tooltip 固定出现在头像框上边缘中间。
 */
export function OperatorSkillTooltip({
  name,
  trigger,
  highlightedSkillIds = [],
  contextLabel,
  delay,
  disabled,
}: {
  name: string;
  trigger: ReactElement;
  highlightedSkillIds?: readonly string[];
  contextLabel?: string;
  delay?: number;
  disabled?: boolean;
}) {
  const { locale } = useLanguageDemo();
  const [open, setOpen] = useState(false);
  const skills = operatorBuildingSkillList(name);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  if (skills.length === 0) return trigger; // 未知干员：原样渲染，不包 Tooltip
  const highlighted = new Set(highlightedSkillIds);
  const sourceProps = trigger.props as {
    onClick?: MouseEventHandler<HTMLElement>;
    onKeyDown?: KeyboardEventHandler<HTMLElement>;
  };
  const interactiveTrigger = cloneElement(trigger as ReactElement<Record<string, unknown>>, {
    onClick: ((event) => {
      sourceProps.onClick?.(event);
      if (!event.defaultPrevented) setOpen(true);
    }) as MouseEventHandler<HTMLElement>,
    onKeyDown: ((event) => {
      sourceProps.onKeyDown?.(event);
      if (!event.defaultPrevented && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        setOpen(true);
      }
    }) as KeyboardEventHandler<HTMLElement>,
  });

  const content = (
    <TooltipContent
      side="top"
      align="center"
      className="max-w-[calc(100vw-2rem)] flex-col items-start gap-2 whitespace-normal px-3 py-2.5 text-left leading-relaxed sm:max-w-md"
    >
      {contextLabel ? (
        <span className="border-b border-background/15 pb-1 text-[11px] font-semibold tracking-wide text-background/60">
          {contextLabel}
        </span>
      ) : null}
      {skills.map((sourceSkill) => (
        <SkillBlock
          key={sourceSkill.id}
          locale={locale}
          skill={demoBuildingSkill(sourceSkill.id, locale, sourceSkill) as BuildingSkillPresentation}
          highlighted={highlighted.has(sourceSkill.id)}
        />
      ))}
    </TooltipContent>
  );

  if (disabled !== undefined) {
    return (
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger render={trigger} delay={delay} disabled={disabled} />
        {content}
      </Tooltip>
    );
  }

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger closeOnClick={false} render={interactiveTrigger} />
      {content}
    </Tooltip>
  );
}

function SkillBlock({ skill, locale, highlighted }: { skill: BuildingSkillPresentation; locale: "zh" | "en"; highlighted: boolean }) {
  return (
    <div className={cn("min-w-0", highlighted && "border-l-2 border-[#FFD501] pl-2")}>
      <span className="flex flex-wrap items-center gap-1.5 font-semibold">
        <img src={skill.icon} alt="" aria-hidden="true" className="size-7 shrink-0 object-contain" />
        <span>{skill.name}</span>
        {highlighted ? (
          <span className="rounded-sm bg-[#FFD501] px-1.5 py-0.5 text-[10px] font-bold text-[#202223]">
            {locale === "en" ? "THIS TARGET" : "本次目标"}
          </span>
        ) : null}
      </span>
      <span className="mt-1 block text-background/72">
        {locale === "en" ? (
          <>{skill.enhanced ? <>{buildingSkillUnlockLabelEnglish(skill.elite, skill.level).replace(/unlock$/, "")}<span className="text-[#22BBFF]">upgrade</span></> : buildingSkillUnlockLabelEnglish(skill.elite, skill.level)}</>
        ) : skill.enhanced ? (
          <>
            <span>{buildingSkillUnlockPrefix(skill.elite, skill.level)}</span>
            <span className="text-[#22BBFF]">{BUILDING_SKILL_ENHANCED_WORD}</span>
          </>
        ) : (
          buildingSkillUnlockLabel(skill.elite, skill.level)
        )}
      </span>
      <span className="mt-1 block">
        {skill.descriptionRich ? <RichTextHoverTerms text={skill.descriptionRich} /> : skill.description}
      </span>
    </div>
  );
}
