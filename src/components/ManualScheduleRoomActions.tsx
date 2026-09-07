"use client";
import { useTranslations } from "next-intl";
import { Sparkles, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { RoomRow } from "@/schedule";

export function ManualScheduleRoomActions({ row, position, roomTitle, onClearRoom, onDormAutofillChange, droneTargetRoomId, onDroneTargetChange }: {
  row: RoomRow;
  position: "header" | "clear";
  roomTitle: string;
  onClearRoom: (row: RoomRow) => void;
  onDormAutofillChange: (row: RoomRow, enabled: boolean) => void;
  droneTargetRoomId?: string | null;
  onDroneTargetChange: (row: RoomRow) => void;
}) {
  const intl = useTranslations();
  return position === "header" ? (
    <>
      {row.group === "dormitory" && onDormAutofillChange ? (
      <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-pressed={row.autofill}
      aria-label={`${roomTitle}${intl("components.label")}${intl("components.autoFill")}`}
      className={cn(
      "ml-1 h-7 border px-2 text-xs text-white hover:text-white",
      row.autofill ? "border-[#FFD800]/70 bg-[#FFD800]/18" : "border-white/15 bg-[#3C3C3C]/55",
      )}
      onClick={() => onDormAutofillChange(row, !row.autofill)}
      >
      <Sparkles className="size-3.5" />{intl("components.autoFill")}
      </Button>
      ) : null}
      {(row.group === "trading" || row.group === "manufacture") && onDroneTargetChange ? (
      <Tooltip>
      <TooltipTrigger
      render={
      <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-pressed={droneTargetRoomId === row.roomId}
      aria-label={intl("components_CompactScheduleView.droneAcceleration", { roomTitle: roomTitle })}
      className={cn(
      "ml-auto h-7 border px-2 text-xs text-white hover:text-white",
      droneTargetRoomId === row.roomId ? "border-[#FFD800]/70 bg-[#FFD800]/18" : "border-white/15 bg-[#3C3C3C]/55",
      )}
      onClick={() => onDroneTargetChange(row)}
      >
      <Zap className="size-3.5" aria-hidden="true" />
      <span className="sm:hidden">{intl("components_CompactScheduleView.drones")}</span>
      </Button>
      }
      />
      <TooltipContent side="left">
      {droneTargetRoomId === row.roomId
      ? intl("components_CompactScheduleView.disableDroneAcceleration")
      : intl("components_CompactScheduleView.useDronesForShift")}
      </TooltipContent>
      </Tooltip>
      ) : null}
    </>
  ) : (
    <>
      {onClearRoom ? <Tooltip>
      <TooltipTrigger
      render={
      <span className="absolute right-2 top-2 z-20">
      <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 border border-white/10 bg-[#3C3C3C]/55 px-2 text-xs text-white/70 hover:bg-[#4B4B4B] hover:text-white max-sm:h-11"
      aria-label={intl("components_CompactScheduleView.clearRoom", { roomTitle: roomTitle })}
      onClick={() => onClearRoom(row)}
      >
      <Trash2 className="size-3.5" /><span className="sm:hidden">{intl("components_CompactScheduleView.clear")}</span>
      </Button>
      </span>
      }
      />
      <TooltipContent side="left">{intl("components_CompactScheduleView.clearThisFacility")}</TooltipContent>
      </Tooltip> : null}
    </>
  );
}
