import type { OperBoxEntry } from "./types";

function eliteState(entry: OperBoxEntry | undefined): number {
  return entry?.own ? entry.elite : -1;
}

export function hasOperboxEliteStateChange(
  currentBox: readonly OperBoxEntry[],
  trialBox: readonly OperBoxEntry[],
): boolean {
  const currentById = new Map(currentBox.map((entry) => [entry.id, entry]));
  return trialBox.some((entry) => eliteState(entry) !== eliteState(currentById.get(entry.id)));
}
