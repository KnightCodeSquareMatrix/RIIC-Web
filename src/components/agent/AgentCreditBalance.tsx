"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export function AgentCreditBalance({ enabled, busy, en }: { enabled: boolean; busy: boolean; en: boolean }) {
  const [points, setPoints] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled || busy) return;
    let request: AbortController | undefined;
    const refresh = async () => {
      request?.abort();
      const controller = new AbortController();
      request = controller;
      try {
        const response = await fetch("/api/billing", { credentials: "same-origin", cache: "no-store", signal: controller.signal });
        const payload = await response.json() as { data?: { wallet?: { totalPoints?: unknown } } };
        const total = payload.data?.wallet?.totalPoints;
        if (!controller.signal.aborted) setPoints(response.ok && typeof total === "number" && Number.isFinite(total) ? total : null);
      } catch {
        if (!controller.signal.aborted) setPoints(null);
      }
    };
    const focus = () => { if (document.visibilityState === "visible") void refresh(); };
    void refresh();
    window.addEventListener("focus", focus);
    return () => { request?.abort(); window.removeEventListener("focus", focus); };
  }, [enabled, busy]);

  if (!enabled) return null;
  return <Link href="/billing" data-agent-credit-balance className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-md px-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
    <span>{en ? "Credits left" : "剩余积分"}</span>
    <span className="font-number font-medium tabular-nums text-foreground">{points === null ? "—" : points.toLocaleString(en ? "en-US" : "zh-CN")}</span>
  </Link>;
}
