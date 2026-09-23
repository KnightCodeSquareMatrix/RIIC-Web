import type { BaseBlueprint } from "./types.ts";
import type { OperatorAssetRecord } from "./operatorPortraits.ts";

const ROOM_SKILL_PREFIXES: Record<string, string> = {
  control_center: "control", trade_post: "trade", factory: "manu", power_plant: "power",
  dormitory: "dormitory", office: "hire", meeting_room: "meet", workshop: "workshop", training_room: "train",
};

export function operatorsWithoutLayoutSkills(
  catalog: readonly Pick<OperatorAssetRecord, "name" | "buildingSkills">[],
  rooms: BaseBlueprint["rooms"],
): Set<string> {
  const prefixes = new Set(rooms.map(room => ROOM_SKILL_PREFIXES[room.kind]).filter(Boolean));
  // Full skill families (e.g. manu_spd) differ from room categories (manu).
  return new Set(catalog.filter(operator => !operator.buildingSkills.some(skill =>
    prefixes.has(skill.id.split("_")[0]!),
  )).map(operator => operator.name));
}
