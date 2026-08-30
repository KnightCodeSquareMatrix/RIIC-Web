"use client";

/**
 * Adapted from Interior's Password Strength component.
 * Copyright (c) 2026 ozzy. MIT license: ./LICENSE
 */
import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

const CELL = { type: "spring", stiffness: 520, damping: 34, mass: 0.45 } as const;
const CROSSFADE = { type: "spring", stiffness: 260, damping: 34, mass: 0.8 } as const;
const INSTANT = { duration: 0 } as const;
const COMMON = /^(?:password|passw0rd|qwerty|letmein|welcome|admin|iloveyou|monkey|dragon|abc123|111111|123123|123456)/i;
const RUN = /(.)\1{3,}/;
const RUN_UP = /(?:0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef|defg|qwer|wert|erty|asdf)/i;

export type PasswordRule = {
  id: string;
  label: string;
  test: (value: string) => boolean;
};

const DEFAULT_RULES: readonly PasswordRule[] = [
  { id: "length", label: "至少 10 个字符", test: (value) => value.length >= 10 },
  { id: "letter", label: "包含字母", test: (value) => /[a-z]/i.test(value) },
  { id: "digit", label: "包含数字", test: (value) => /\d/.test(value) },
  { id: "variety", label: "包含大小写或符号", test: (value) => (/[a-z]/.test(value) && /[A-Z]/.test(value)) || /[^a-z0-9]/i.test(value) },
];

const DEFAULT_LABELS = ["尚未输入", "较弱", "一般", "良好", "强"] as const;

export function PasswordStrength({ value, className = "" }: { value: string; className?: string }) {
  const reduced = useReducedMotion();
  const state = useMemo(() => {
    const rules = DEFAULT_RULES.map((rule) => ({ ...rule, met: rule.test(value) }));
    const passed = rules.filter((rule) => rule.met).length;
    const guessable = value.length > 0 && (COMMON.test(value) || RUN.test(value) || RUN_UP.test(value));
    const score = value.length === 0 ? 0 : guessable ? 1 : Math.min(DEFAULT_RULES.length, Math.max(1, passed));
    const unmet = rules.filter((rule) => !rule.met);
    const announcement = value.length === 0
      ? ""
      : `密码强度${DEFAULT_LABELS[score]}。${guessable ? "这个密码模式容易被猜到。" : ""}${unmet.length ? `还需要：${unmet.map((rule) => rule.label).join("、")}。` : "全部建议均已满足。"}`;
    return { rules, guessable, score, announcement };
  }, [value]);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    if (!state.announcement) {
      setAnnouncement("");
      return;
    }
    const timeout = window.setTimeout(() => setAnnouncement(state.announcement), 700);
    return () => window.clearTimeout(timeout);
  }, [state.announcement]);

  const tone = state.score === 0
    ? { bar: "bg-muted-foreground/25", text: "text-muted-foreground" }
    : state.score <= 1
      ? { bar: "bg-destructive", text: "text-destructive" }
      : state.score <= 2
        ? { bar: "bg-amber-500", text: "text-amber-700" }
        : { bar: "bg-emerald-500", text: "text-emerald-700" };

  return (
    <div className={`w-full ${className}`} data-password-strength>
      <div
        role="meter"
        aria-label="密码强度"
        aria-valuemin={0}
        aria-valuemax={DEFAULT_RULES.length}
        aria-valuenow={state.score}
        aria-valuetext={DEFAULT_LABELS[state.score]}
        className="grid grid-cols-4 gap-1.5"
      >
        {DEFAULT_RULES.map((rule, index) => (
          <div key={rule.id} className="relative h-1.5 overflow-hidden rounded-sm bg-muted">
            <motion.span
              className={`absolute inset-0 origin-left rounded-sm ${tone.bar}`}
              initial={false}
              animate={{ scaleX: index < state.score ? 1 : 0 }}
              transition={reduced ? INSTANT : { ...CELL, delay: index < state.score ? index * 0.03 : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex min-h-5 items-center justify-between gap-3 text-xs">
        <span className={`font-medium ${tone.text}`}>密码强度：{DEFAULT_LABELS[state.score]}</span>
        <motion.span
          aria-hidden="true"
          className="text-amber-700"
          initial={false}
          animate={{ opacity: state.guessable ? 1 : 0 }}
          transition={reduced ? INSTANT : CROSSFADE}
        >
          容易被猜到
        </motion.span>
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        {state.rules.map((rule) => (
          <li key={rule.id} className={`flex items-center gap-1.5 text-xs ${rule.met ? "text-foreground" : "text-muted-foreground"}`}>
            <span className={`grid size-3.5 shrink-0 place-items-center rounded border ${rule.met ? "border-emerald-500 bg-emerald-500 text-white" : "border-border"}`} aria-hidden="true">
              {rule.met ? "✓" : null}
            </span>
            {rule.label}
            <span className="sr-only">{rule.met ? "已满足" : "未满足"}</span>
          </li>
        ))}
      </ul>
      <p aria-live="polite" className="sr-only">{announcement}</p>
    </div>
  );
}
