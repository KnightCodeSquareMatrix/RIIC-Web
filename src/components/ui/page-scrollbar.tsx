"use client";

import { useEffect } from "react";
import type { PartialOptions } from "overlayscrollbars";

const PAGE_SCROLLBAR_OPTIONS = {
  overflow: { x: "hidden", y: "scroll" },
  scrollbars: {
    theme: "os-theme-yeye",
    autoHide: "leave",
    autoHideDelay: 600,
    autoHideSuspend: true,
    dragScroll: true,
    clickScroll: false,
  },
} satisfies PartialOptions;

export function PageScrollbar() {
  useEffect(() => {
    if (isTouchViewport()) return;

    let cancelled = false;
    let destroy: (() => void) | undefined;
    const root = document.documentElement;
    void import("overlayscrollbars")
      .then(({ OverlayScrollbars }) => {
        if (cancelled) return;
        root.setAttribute("data-overlayscrollbars-initialize", "");
        document.body.setAttribute("data-overlayscrollbars-initialize", "");
        const instance = OverlayScrollbars(
          {
            target: document.body,
            cancel: { nativeScrollbarsOverlaid: false, body: false },
          },
          PAGE_SCROLLBAR_OPTIONS,
        );
        destroy = () => instance.destroy();
      })
      .catch(() => {
        root.removeAttribute("data-overlayscrollbars-initialize");
        document.body.removeAttribute("data-overlayscrollbars-initialize");
      });

    return () => {
      cancelled = true;
      destroy?.();
      root.removeAttribute("data-overlayscrollbars-initialize");
      document.body.removeAttribute("data-overlayscrollbars-initialize");
    };
  }, []);

  return null;
}

function isTouchViewport() {
  const hasCoarsePointer = window.matchMedia?.("(pointer: coarse)").matches === true;
  const isSmallTouchViewport =
    window.matchMedia?.("(max-width: 767px)").matches === true &&
    window.navigator.maxTouchPoints > 0;

  return hasCoarsePointer || isSmallTouchViewport;
}
