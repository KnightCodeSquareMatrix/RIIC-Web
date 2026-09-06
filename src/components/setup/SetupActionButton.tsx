"use client";

import type { ComponentProps } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type SetupActionButtonProps = Omit<ComponentProps<typeof Button>, "size"> & { asLabel?: false };
type SetupActionLabelProps = Omit<ComponentProps<"label">, "size"> & { asLabel: true };

const SETUP_ACTION_CLASS = "h-11 min-w-[152px] px-4 text-xs font-semibold max-sm:min-w-[152px] sm:h-9 sm:min-w-[152px] sm:px-4";

/** Compact pill action shared by the schedule setup surfaces. */
export function SetupActionButton(props: SetupActionButtonProps | SetupActionLabelProps) {
  if (props.asLabel) {
    const { asLabel, className, style, ...labelProps } = props;
    return (
      <Label
        {...labelProps}
        pressable
        className={cn(
          buttonVariants({ size: "dialog" }),
          SETUP_ACTION_CLASS,
          "has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/50",
          className,
        )}
        style={{ borderRadius: 18, ...style }}
        data-setup-action=""
        data-setup-action-kind={asLabel ? "label" : "button"}
      />
    );
  }

  const { asLabel, className, style, ...buttonProps } = props;
  return (
    <Button
      {...buttonProps}
      size="dialog"
      className={cn(SETUP_ACTION_CLASS, className)}
      style={{ borderRadius: 18, ...style }}
      data-setup-action=""
      data-setup-action-kind={asLabel ? "label" : "button"}
    />
  );
}
