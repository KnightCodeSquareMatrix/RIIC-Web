import { formatMasteryTime, type MasteryPlan } from "./mastery.ts";

export type MasteryInstruction = { elapsed: number; text: string; kind: "start" | "switch" | "complete" | "notice" };
/** Shared by the visible timeline and clipboard so execution instructions cannot drift. */
export function masteryInstructions(plan: MasteryPlan, en = false, operatorName: (name: string) => string = (name) => name): MasteryInstruction[][] {
  let elapsed = 0;
  return plan.stages.map((stage) => {
    const rows: MasteryInstruction[] = [];
    const first = stage.segments[0]!;
    const firstName = first.trainerId ? operatorName(first.trainerName) : (en ? "no trainer" : "空协助位");
    if (stage.discardPreviousHalving) rows.push({ elapsed, kind: "notice", text: en ? "Remove the previous trainer before starting (discard the saved halving)." : "先移走上一阶段教官，清除待用减半效果，再开启本阶段。" });
    if (stage.activateWith) {
      rows.push({ elapsed, kind: "start", text: en ? `Start M${stage.level} with ${operatorName(stage.activateWith.name)} to apply the 50% reduction.` : `保留${operatorName(stage.activateWith.name)}，先开启专${stage.level}，确认减半效果生效。` });
      if (stage.activateWith.id !== first.trainerId) rows.push({ elapsed, kind: "switch", text: en ? `Then immediately switch to ${firstName}.` : `减半生效后，立即换为${firstName}。` });
    } else rows.push({ elapsed, kind: "start", text: en ? `Start M${stage.level} with ${firstName}.` : `使用${firstName}开启专${stage.level}。` });
    stage.segments.forEach((segment, index) => {
      const name = segment.trainerId ? operatorName(segment.trainerName) : (en ? "no trainer" : "空协助位");
      if (index) rows.push({ elapsed, kind: "switch", text: en ? `Switch to ${name}.` : `换为${name}。` });
      rows.push({ elapsed, kind: "notice", text: en ? `${name}: train for ${formatMasteryTime(segment.seconds)} at ${(segment.rate * 100).toFixed(0)}% total speed.` : `${name}训练 ${formatMasteryTime(segment.seconds)}，总训练效率 ${(segment.rate * 100).toFixed(0)}%。` });
      elapsed += segment.seconds;
    });
    rows.push({ elapsed, kind: "complete", text: en ? `Complete M${stage.level}.` : `收取专${stage.level}。` });
    if (stage.nextHalvingTrainerId) rows.push({ elapsed, kind: "notice", text: en ? "Keep both operators in the training room. Start the next stage before changing trainers." : "保留学员和教官在训练室；先开启下一阶段，再按下一步换人。" });
    return rows;
  });
}

export function masteryClipboard(plan: MasteryPlan, targetName: string, en = false, operatorName?: (name: string) => string): string {
  return [
    `${targetName} · ${en ? (plan.mode === "simple" ? "Simple" : "Fast") : (plan.mode === "simple" ? "省操作" : "极速")} · ${formatMasteryTime(plan.totalSeconds)}`,
    ...masteryInstructions(plan,en,operatorName).flat().map((step) => `[+${formatMasteryTime(step.elapsed)}] ${step.text}`),
  ].join("\n");
}
