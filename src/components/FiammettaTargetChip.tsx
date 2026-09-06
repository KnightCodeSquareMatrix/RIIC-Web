"use client";
import { useTranslations, useLocale } from "next-intl";

import { HeartPulse } from "lucide-react";

import { localizedOperatorName } from "@/i18n/game-data";

export interface FiammettaTargetChipProps {
  target?: string | null;
  portrait?: string | null;
  onClick?: () => void;
}

/** Shared morale-recovery target used beside schedule shift controls. */
export function FiammettaTargetChip({ target, portrait, onClick }: FiammettaTargetChipProps) {
  const intl = useTranslations();
  const locale = useLocale();

  const displayTarget = target ? localizedOperatorName(target, locale) : null;
  const label = displayTarget
    ? (intl("components_FiammettaTargetChip.moraleRecovery", { displayTarget: displayTarget }))
    : (intl("components_FiammettaTargetChip.chooseMoraleTarget"));
  const title = displayTarget
    ? (intl("components_FiammettaTargetChip.fiammettaRestores", { displayTarget: displayTarget }))
    : label;
  const className = "flex h-7 items-center gap-1 rounded-[min(var(--radius-md),12px)] border border-[#016E65]/30 bg-[#016E65]/10 px-2.5 text-[0.8rem] text-[#016E65] shadow-xs max-sm:h-11";
  const content = (
    <>
      <span className="size-5 shrink-0 overflow-hidden rounded-full border border-[#016E65]/25 bg-[#272A2B]">
        {portrait && displayTarget
          ? <img src={portrait} alt="" className="size-full object-cover" />
          : <HeartPulse className="m-1 size-3 text-[#016E65]" />}
      </span>
      {displayTarget ? (
        <span className="whitespace-nowrap"><span className="text-[#016E65]/70">{intl("components_FiammettaTargetChip.moraleRecovery2")}</span> {displayTarget}</span>
      ) : (
        <span className="whitespace-nowrap">{label}</span>
      )}
    </>
  );

  return onClick ? (
    <button
      type="button"
      className={`${className} cursor-pointer outline-none transition-colors hover:bg-[#016E65]/15 focus-visible:ring-2 focus-visible:ring-[#FFD800] focus-visible:ring-offset-1`}
      aria-label={label}
      title={title}
      data-fiammetta-target-chip
      onClick={onClick}
    >
      {content}
    </button>
  ) : (
    <span className={className} title={title} data-fiammetta-target-chip>
      {content}
    </span>
  );
}
