export interface MaaRoomAutofillContext {
  group: string;
  skip?: boolean;
  occupiedSlots: number;
  capacity: number;
}

export function maaRoomAutofill(
  value: unknown,
  context?: MaaRoomAutofillContext,
): boolean {
  if (value === true) return true;
  if (!context || context.group !== "dormitory" || context.skip === true) return false;
  return context.occupiedSlots < context.capacity;
}
