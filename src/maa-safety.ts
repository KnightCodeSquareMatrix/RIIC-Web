import { stripInternalFields } from "./internal-field-safety.ts";
import { maaRoomAutofill } from "./schedule-autofill.ts";
import type { BaseBlueprint, MaaJson, MaaRoom, MaaRooms } from "./types.ts";

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

/**
 * Prepare a schedule for MAA export.
 *
 * MAA uses `sort: true` to respect the operator order in each room's
 * `operators` array. The array already follows the order shown in the UI,
 * so preserve it exactly while removing runtime-only fields.
 * Calculator exports also resolve dorm autofill using the displayed layout;
 * manual exports omit calculatorLayout to preserve the user's explicit choices.
 */
export function prepareMaaForExport<T extends MaaJson>(
  maa: T,
  strictOperatorOrder = true,
  allowReplacementOperatorSort = false,
  calculatorLayout?: BaseBlueprint,
): T {
  const exported = sanitizeMaaJson(maa);
  const layoutRooms = new Map(calculatorLayout?.rooms.map((room) => [room.id, room]));

  for (const plan of exported.plans) {
    if (calculatorLayout) {
      plan.rooms.dormitory?.forEach((room, index) => {
        const occupiedSlots = (room.operators ?? []).filter((operator) => (
          typeof operator === "string" ? operator.trim() : operator?.name?.trim()
        )).length;
        room.autofill = maaRoomAutofill(room.autofill, {
          group: "dormitory",
          skip: room.skip,
          candidates: room.candidates,
          occupiedSlots,
          capacity: layoutRooms.get(`dorm_${index + 1}`)?.dorm_beds ?? 5,
        });
      });
    }
    if (plan.Fiammetta) plan.Fiammetta.order = "pre";
    if (plan.drones) plan.drones.order = "pre";
    for (const rooms of Object.values(plan.rooms)) {
      if (!rooms) continue;
      for (const room of rooms) {
        room.sort = strictOperatorOrder || allowReplacementOperatorSort;
      }
    }
  }

  return exported;
}
