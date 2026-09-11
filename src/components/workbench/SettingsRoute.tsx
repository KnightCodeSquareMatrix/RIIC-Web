"use client";

import { UserSettingsPage } from "@/components/pages/UserSettingsPage";
import { useWorkbench } from "@/workbench-context";

export function SettingsRoute() {
  const { settings } = useWorkbench();
  return <UserSettingsPage settings={settings.value} onSettingsChange={settings.onChange} />;
}
