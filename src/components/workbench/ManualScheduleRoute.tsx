"use client";

import { ManualSchedulePage } from "@/components/pages/ManualSchedulePage";
import { useWorkbench } from "@/workbench-context";

export function ManualScheduleRoute() {
  const { manual } = useWorkbench();
  return <ManualSchedulePage {...manual} />;
}
