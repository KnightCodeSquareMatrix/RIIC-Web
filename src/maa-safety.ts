import { stripInternalFields } from "./internal-field-safety.ts";
import type { MaaJson, MaaRoom, MaaRooms } from "./types.ts";

const MAA_ROOM_KINDS = [
  "trading",
  "manufacture",
  "power",
  "control",
  "dormitory",
  "meeting",
  "hire",
  "processing",
] as const satisfies readonly (keyof MaaRooms)[];

function validCandidates(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((candidate) => typeof candidate === "string");
}

/**
 * Removes internal runtime fields while preserving the MAA protocol's room-level
 * operator candidates. `candidates` remains blocked everywhere else because the
 * server also uses that name for private executable and data-path diagnostics.
 */
export function sanitizeMaaJson<T extends MaaJson>(maa: T): T {
  const source = structuredClone(maa);
  const sanitized = stripInternalFields(source);

  source.plans.forEach((sourcePlan, planIndex) => {
    const sanitizedPlan = sanitized.plans[planIndex];
    if (!sanitizedPlan) return;

    delete (sanitizedPlan.rooms as MaaRooms & { training?: unknown }).training;

    for (const roomKind of MAA_ROOM_KINDS) {
      const sourceRooms = sourcePlan.rooms[roomKind];
      const sanitizedRooms = sanitizedPlan.rooms[roomKind];
      if (!sourceRooms || !sanitizedRooms) continue;

      sourceRooms.forEach((sourceRoom: MaaRoom, roomIndex) => {
        if (validCandidates(sourceRoom.candidates) && sanitizedRooms[roomIndex]) {
          sanitizedRooms[roomIndex].candidates = [...sourceRoom.candidates];
        }
      });
    }
  });

  return sanitized;
}
