"use client";

import { useEffect } from "react";

import { usePathname } from "next/navigation";

export function TelemetryLoader() {
  const pathname = usePathname();
  useEffect(() => {
    let disposed = false;
    let stop: (() => void) | undefined;
    void import("./TelemetryRuntime")
      .then(({ startTelemetryRuntime }) => {
        if (disposed) return;
        stop = startTelemetryRuntime(window.location.pathname);
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      stop?.();
    };
  }, []);
  useEffect(() => {
    void import("./TelemetryRuntime")
      .then(({ trackTelemetryPage }) => trackTelemetryPage(pathname))
      .catch(() => undefined);
  }, [pathname]);
  return null;
}
