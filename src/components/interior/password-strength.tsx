"use client";

/**
 * Adapted from Interior's Password Strength component.
 * Copyright (c) 2026 ozzy. MIT license: ./LICENSE
 */
import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useLanguageDemo } from "@/language-demo";

import { evaluatePasswordStrength } from "@/password-strength";

const CELL = { type: "spring", stiffness: 520, damping: 34, mass: 0.45 } as const;
const CROSSFADE = { type: "spring", stiffness: 260, damping: 34, mass: 0.8 } as const;
const INSTANT = { duration: 0 } as const;
const DEFAULT_LABELS = ["尚未输入", "较弱", "一般", "良好", "强"] as const;
const EN_LABELS = ["Not entered", "Weak", "Fair", "Good", "Strong"] as const;

export function PasswordStrength({ value, className = "", id }: { value: string; className?: string; id?: string }) {
  const { locale } = useLanguageDemo();
  const en = locale === "en";
  const reduced = useReducedMotion();
  const labels = en ? EN_LABELS : DEFAULT_LABELS;
  const state = useMemo(() => {
    const strength = evaluatePasswordStrength(value);
    const rules = strength.rules.map((rule) => ({
      ...rule,
      label: en
        ? ({ length: "At least 10 characters", letter: "Contains a letter", digit: "Contains a number", variety: "Mixed case or a symbol" }[rule.id] ?? rule.label)
        : rule.label,
    }));
    const unmet = rules.filter((rule) => !rule.met);
    const announcement = value.length === 0
      ? ""
      : en
        ? `Password strength: ${EN_LABELS[strength.score]}. ${strength.guessable ? "This password pattern is easy to guess. " : ""}${unmet.length ? `Still needed: ${unmet.map((rule) => rule.label).join(", ")}.` : "All recommendations are met."}`
        : `密码强度${DEFAULT_LABELS[strength.score]}。${strength.guessable ? "这个密码模式容易被猜到。" : ""}${unmet.length ? `还需要：${unmet.map((rule) => rule.label).join("、")}。` : "全部规则均已满足。"}`;
    return { ...strength, rules, announcement };
  }, [en, value]);
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
    <div id={id} className={`w-full ${className}`} data-password-strength>
      <div
        role="meter"
        aria-label={en ? "Password strength" : "密码强度"}
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={state.score}
        aria-valuetext={labels[state.score]}
        className="grid grid-cols-4 gap-1.5"
      >
        {state.rules.map((rule, index) => (
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
        <span className={`font-medium ${tone.text}`}>{en ? `Password strength: ${labels[state.score]}` : `密码强度：${labels[state.score]}`}</span>
        <motion.span
          aria-hidden="true"
          className="text-amber-700"
          initial={false}
          animate={{ opacity: state.guessable ? 1 : 0 }}
          transition={reduced ? INSTANT : CROSSFADE}
        >
          {en ? "Easy to guess" : "容易被猜到"}
        </motion.span>
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        {state.rules.map((rule) => (
          <li key={rule.id} className={`flex items-center gap-1.5 text-xs ${rule.met ? "text-foreground" : "text-muted-foreground"}`}>
            <span className={`grid size-3.5 shrink-0 place-items-center rounded border ${rule.met ? "border-emerald-500 bg-emerald-500 text-white" : "border-border"}`} aria-hidden="true">
              {rule.met ? "✓" : null}
            </span>
            {rule.label}
            <span className="sr-only">{rule.met ? (en ? "Met" : "已满足") : (en ? "Not met" : "未满足")}</span>
          </li>
        ))}
      </ul>
      <p aria-live="polite" className="sr-only">{announcement}</p>
    </div>
  );
}
