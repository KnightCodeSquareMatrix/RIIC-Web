"use client";

import { Check } from "lucide-react";

import type { OperBoxEntry, RotationProfile } from "@/types";

type FiammettaSettingsProps = {
  enabled: boolean;
  operbox: OperBoxEntry[] | null;
  rotation: RotationProfile;
  onEnabledChange: (enabled: boolean) => void;
};

export function FiammettaSettings({ enabled, operbox, rotation, onEnabledChange }: FiammettaSettingsProps) {
  const ownsFiammetta = Boolean(operbox?.some((operator) => operator.own && operator.name === "菲亚梅塔"));
  const rotationForcesEnabled = rotation === "fiammetta_8_8_4_4";
  const checked = enabled && ownsFiammetta;

  return (
    <section className="grid gap-3" aria-labelledby="fiammetta-settings-title">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h3 id="fiammetta-settings-title" className="text-sm font-semibold">菲亚梅塔恢复心情</h3>
          <p className="mt-1 text-xs text-muted-foreground">启用后，排班请求将开启菲亚梅塔恢复心情。</p>
        </div>
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          disabled={!ownsFiammetta || rotationForcesEnabled}
          className="flex min-h-11 shrink-0 items-center gap-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-45"
          onClick={() => onEnabledChange(!checked)}
        >
          <span className={`grid size-5 place-items-center border transition-colors ${checked ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}>
            {checked ? <Check className="size-3.5" aria-hidden="true" /> : null}
          </span>
          {checked ? "已启用" : "未启用"}
        </button>
      </div>

      {!ownsFiammetta ? <p className="text-xs text-amber-700" role="status">当前 Box 未拥有菲亚梅塔，无法使用。</p> : null}
    </section>
  );
}
