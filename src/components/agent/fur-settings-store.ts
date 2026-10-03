"use client";

import { useMemo, useSyncExternalStore } from "react";
import { agentFurSettings, FUR_STORAGE_KEY, savedFurSettings } from "./fur-settings";

const CHANGE_EVENT = "riic:plush-settings";
const emptySnapshot = () => "";
const noSubscription = () => () => {};

function snapshot() {
  try { return localStorage.getItem(FUR_STORAGE_KEY) ?? ""; }
  catch { return ""; }
}

function subscribe(notify: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === FUR_STORAGE_KEY || event.key === null) notify();
  };
  window.addEventListener("storage", storage);
  window.addEventListener(CHANGE_EVENT, notify);
  return () => {
    window.removeEventListener("storage", storage);
    window.removeEventListener(CHANGE_EVENT, notify);
  };
}

export function notifyFurSettingsChanged() {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useAgentFurSettings(variant: string, enabled: boolean) {
  const serialized = useSyncExternalStore(enabled ? subscribe : noSubscription, enabled ? snapshot : emptySnapshot, emptySnapshot);
  return useMemo(() => agentFurSettings(savedFurSettings(serialized, variant)), [serialized, variant]);
}
