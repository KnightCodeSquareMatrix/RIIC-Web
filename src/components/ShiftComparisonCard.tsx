"use client";

import type { CSSProperties, ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";
import { MOTION_DURATION, MOTION_EASE_OUT } from "@/motion";
import { roomLightAccentFor } from "@/room-visuals";
import type { ShiftAdjustment, ShiftAdjustmentIssue, ShiftComparison } from "@/types";

const ROOM_LABELS: Record<string, string> = { control: "控制中枢", trading: "贸易站", manufacture: "制造站", power: "发电站", dormitory: "宿舍", meeting: "会客室", hire: "办公室", processing: "加工站" };
const ISSUE_LABELS: Record<ShiftAdjustmentIssue, string> = { missing: "需换入", unexpected: "需换出", misplaced: "位置调整", tired: "疲劳" };
const ACTION_ISSUES = ["unexpected", "missing", "misplaced"] as const;
type ActionIssue = typeof ACTION_ISSUES[number];

function roomKeyParts(key: string | null) {
  if (!key) return { group: "default", label: "未进驻" };
  const [group, indexText] = key.split(":");
  const groupLabel = ROOM_LABELS[group] ?? "未知设施";
  const index = Number(indexText);
  return {
    group: ROOM_LABELS[group] ? group : "default",
    label: group === "control" ? groupLabel : `${groupLabel} ${Number.isFinite(index) ? index + 1 : indexText}`,
  };
}

export function roomKeyLabel(key: string | null) {
  return roomKeyParts(key).label;
}

function issueTone(issue: ShiftAdjustmentIssue) {
  if (issue === "tired") return "bg-red-100 text-red-800";
  if (issue === "missing") return "bg-sky-100 text-sky-800";
  if (issue === "unexpected") return "bg-amber-100 text-amber-800";
  return "bg-zinc-200 text-zinc-800";
}

function IssueLabel({ issue }: { issue: ShiftAdjustmentIssue }) {
  return <span className={cn("inline-flex px-2 py-1 text-xs font-semibold", issueTone(issue))}>{ISSUE_LABELS[issue]}</span>;
}

function RoomLabel({ roomKey }: { roomKey: string | null }) {
  const room = roomKeyParts(roomKey);
  const accent = roomLightAccentFor(room.group);
  const style = {
    "--comparison-room-accent": accent,
  } as CSSProperties;

  return (
    <span
      className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-xs font-medium text-zinc-800"
      data-room-label
      data-room-group={room.group}
      style={style}
    >
      <span className="h-3 w-1 shrink-0 bg-[var(--comparison-room-accent)]" data-room-indicator aria-hidden="true" />
      <span className="truncate">{room.label}</span>
    </span>
  );
}

function OperatorName({ adjustment, className }: { adjustment: ShiftAdjustment; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-1.5", className)}>
      <strong className="min-w-0 truncate">{adjustment.operator}</strong>
      {adjustment.issues.includes("tired") ? <IssueLabel issue="tired" /> : null}
    </div>
  );
}

function ActionDescription({ adjustment, issue }: { adjustment: ShiftAdjustment; issue: ActionIssue }) {
  if (issue === "unexpected") return <div className="flex min-w-0 items-center gap-1.5"><span>从</span><RoomLabel roomKey={adjustment.currentRoomKey} /><span>换出</span></div>;
  if (issue === "missing") return <div className="flex min-w-0 items-center gap-1.5"><span>换入</span><RoomLabel roomKey={adjustment.targetRoomKey} /></div>;
  return <div className="flex min-w-0 items-center gap-1.5"><RoomLabel roomKey={adjustment.currentRoomKey} /><span aria-hidden="true">→</span><RoomLabel roomKey={adjustment.targetRoomKey} /></div>;
}

function EmptyGroup() {
  return <p className="mt-2 bg-muted/25 px-3 py-2.5 text-xs text-muted-foreground">无</p>;
}

function GroupHeading({ issue, count, id }: { issue: ActionIssue; count: number; id: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h4 id={id}><IssueLabel issue={issue} /></h4>
      <span className="font-number text-xs text-muted-foreground">{count} 人</span>
    </div>
  );
}

function MobileAdjustmentGroups({ adjustments, reduceMotion }: { adjustments: ShiftAdjustment[]; reduceMotion: boolean }) {
  const tiredOnly = adjustments.filter((adjustment) => adjustment.issues.includes("tired") && !ACTION_ISSUES.some((issue) => adjustment.issues.includes(issue)));

  return (
    <div className="mt-5 grid gap-5 sm:hidden" aria-label="换班动作摘要" data-mobile-adjustment-groups>
      {ACTION_ISSUES.map((issue) => {
        const items = adjustments.filter((adjustment) => adjustment.issues.includes(issue));
        const headingId = `mobile-adjustment-${issue}`;
        return (
          <section key={issue} aria-labelledby={headingId} data-adjustment-group={issue}>
            <GroupHeading issue={issue} count={items.length} id={headingId} />
            {items.length ? (
              <ul className="mt-2 grid gap-2">
                {items.map((adjustment, index) => (
                  <motion.li
                    key={adjustment.operator}
                    className="flex min-w-0 items-center gap-3 bg-muted/45 px-3 py-3"
                    data-mobile-adjustment-row
                    initial={{ opacity: 0, y: reduceMotion ? 0 : 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: reduceMotion ? 0 : MOTION_DURATION.content, delay: reduceMotion ? 0 : index * 0.035, ease: MOTION_EASE_OUT }}
                  >
                    <OperatorName adjustment={adjustment} className="max-w-[38%] shrink-0 text-sm" />
                    <div className="ml-auto min-w-0 text-xs text-muted-foreground" data-mobile-adjustment-action><ActionDescription adjustment={adjustment} issue={issue} /></div>
                  </motion.li>
                ))}
              </ul>
            ) : <EmptyGroup />}
          </section>
        );
      })}
      {tiredOnly.length ? (
        <section aria-labelledby="mobile-adjustment-tired" data-adjustment-group="tired">
          <div className="flex items-center justify-between gap-3">
            <h4 id="mobile-adjustment-tired"><IssueLabel issue="tired" /></h4>
            <span className="font-number text-xs text-muted-foreground">{tiredOnly.length} 人</span>
          </div>
          <p className="mt-2 bg-red-50 px-3 py-2.5 text-xs leading-5 text-red-800">{tiredOnly.map((adjustment) => adjustment.operator).join("、")}</p>
        </section>
      ) : null}
    </div>
  );
}

function DesktopCells({ adjustment, issue }: { adjustment: ShiftAdjustment; issue: ActionIssue }) {
  if (issue === "unexpected") return <><td className="px-3 py-3"><OperatorName adjustment={adjustment} /></td><td className="px-3 py-3"><RoomLabel roomKey={adjustment.currentRoomKey} /></td></>;
  if (issue === "missing") return <><td className="px-3 py-3"><OperatorName adjustment={adjustment} /></td><td className="px-3 py-3"><RoomLabel roomKey={adjustment.targetRoomKey} /></td></>;
  return <><td className="px-3 py-3"><OperatorName adjustment={adjustment} /></td><td className="px-3 py-3"><RoomLabel roomKey={adjustment.currentRoomKey} /></td><td className="px-3 py-3"><RoomLabel roomKey={adjustment.targetRoomKey} /></td></>;
}

function DesktopTable({ items, issue, reduceMotion }: { items: ShiftAdjustment[]; issue: ActionIssue; reduceMotion: boolean }) {
  const roomHeaders: ReactNode = issue === "misplaced"
    ? <><th className="px-3 py-2 text-left font-medium">当前房间</th><th className="px-3 py-2 text-left font-medium">目标房间</th></>
    : <th className="px-3 py-2 text-left font-medium">{issue === "unexpected" ? "当前房间" : "目标房间"}</th>;

  return (
    <table className="mt-2 w-full table-fixed border-collapse" aria-label={`${ISSUE_LABELS[issue]}干员调整`} data-desktop-adjustment-table={issue}>
      <colgroup>
        <col style={{ width: issue === "misplaced" ? "28%" : "38%" }} />
        <col style={{ width: issue === "misplaced" ? "36%" : "62%" }} />
        {issue === "misplaced" ? <col style={{ width: "36%" }} /> : null}
      </colgroup>
      <thead className="border-y border-border/70 bg-muted/45 text-xs font-medium text-muted-foreground">
        <tr><th className="px-3 py-2 text-left font-medium">干员</th>{roomHeaders}</tr>
      </thead>
      <tbody>
        {items.map((adjustment, index) => (
          <motion.tr
            key={adjustment.operator}
            className="border-b border-border/60 align-middle"
            initial={{ opacity: 0, y: reduceMotion ? 0 : 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : MOTION_DURATION.content, delay: reduceMotion ? 0 : index * 0.035, ease: MOTION_EASE_OUT }}
          >
            <DesktopCells adjustment={adjustment} issue={issue} />
          </motion.tr>
        ))}
      </tbody>
    </table>
  );
}

function DesktopAdjustmentGroups({ adjustments, reduceMotion }: { adjustments: ShiftAdjustment[]; reduceMotion: boolean }) {
  return (
    <div className="mt-5 hidden gap-6 sm:grid" aria-label="按操作分组的干员房间调整" data-desktop-adjustment-groups>
      {ACTION_ISSUES.map((issue) => {
        const items = adjustments.filter((adjustment) => adjustment.issues.includes(issue));
        const headingId = `desktop-adjustment-${issue}`;
        return (
          <section key={issue} aria-labelledby={headingId} data-adjustment-group={issue}>
            <GroupHeading issue={issue} count={items.length} id={headingId} />
            {items.length ? <DesktopTable items={items} issue={issue} reduceMotion={reduceMotion} /> : <EmptyGroup />}
          </section>
        );
      })}
    </div>
  );
}

export function ShiftComparisonDetails({ comparison }: { comparison: ShiftComparison | null }) {
  const reduceMotion = useReducedMotion();
  if (!comparison) return null;
  const exactMatch = comparison.adjustments.length === 0;
  return (
    <section className="pt-4 text-sm" aria-labelledby="closest-shift-title" data-shift-comparison-details>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2"><div><span className="text-xs font-medium text-muted-foreground">当前状态匹配</span><h3 id="closest-shift-title" className="mt-0.5 text-base font-semibold">当前最接近第 <span className="font-number">{comparison.planIndex + 1}</span> 班</h3></div><div className="text-right"><span className="text-xs text-muted-foreground">非宿舍匹配</span><strong className="ml-2 text-lg tabular-nums">{comparison.score}%</strong></div></div>
      <div className="mt-3 h-1.5 overflow-hidden bg-border/70" role="progressbar" aria-label="非宿舍设施匹配百分比" aria-valuemin={0} aria-valuemax={100} aria-valuenow={comparison.score}><div className="h-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, comparison.score))}%` }} /></div>
      {exactMatch ? (
        <div className="mt-5 flex gap-3 border border-emerald-200 bg-emerald-50 px-4 py-4 text-emerald-900" role="status"><CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" /><div><strong className="block">当前非宿舍进驻与排班完全一致</strong><span className="mt-1 block text-xs text-emerald-800/75">非宿舍设施无需换入、换出或调整房间。</span></div></div>
      ) : (
        <>
          <MobileAdjustmentGroups adjustments={comparison.adjustments} reduceMotion={Boolean(reduceMotion)} />
          <DesktopAdjustmentGroups adjustments={comparison.adjustments} reduceMotion={Boolean(reduceMotion)} />
        </>
      )}
    </section>
  );
}
