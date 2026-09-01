"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, type ComponentProps } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type PasswordInputProps = Omit<ComponentProps<typeof Input>, "type"> & {
  revealLabel?: string;
  toggleClassName?: string;
};

export function PasswordInput({ className, disabled, id, revealLabel = "显示密码", toggleClassName, ...props }: PasswordInputProps) {
  const [revealed, setRevealed] = useState(false);
  const toggleLabel = revealed ? revealLabel.replace(/^显示/, "隐藏") : revealLabel;

  return (
    <div className="relative">
      <Input
        {...props}
        id={id}
        type={revealed ? "text" : "password"}
        disabled={disabled}
        className={cn("pr-11", className)}
      />
      <button
        type="button"
        className={cn(
          "absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-50",
          toggleClassName,
        )}
        aria-label={toggleLabel}
        aria-controls={id}
        aria-pressed={revealed}
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setRevealed((current) => !current)}
      >
        {revealed ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
      </button>
    </div>
  );
}
