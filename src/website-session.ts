"use client";

import {
  useCallback,
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  requestWebsiteSession,
  type WebsiteSessionData,
} from "@/website-session-data";

export { parseWebsiteSession, type WebsiteSessionData } from "@/website-session-data";

interface WebsiteSessionContextValue {
  data: WebsiteSessionData | null;
  isPending: boolean;
  refetch: () => Promise<void>;
}

const WebsiteSessionContext = createContext<WebsiteSessionContextValue | null>(null);
let initialWebsiteSessionRequest: Promise<WebsiteSessionData | null> | null = null;

function loadInitialWebsiteSession(): Promise<WebsiteSessionData | null> {
  initialWebsiteSessionRequest ??= requestWebsiteSession();
  return initialWebsiteSessionRequest;
}

export function WebsiteSessionProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<WebsiteSessionData | null>(null);
  const [isPending, setIsPending] = useState(true);
  const refetch = useCallback(async () => {
    setIsPending(true);
    const request = requestWebsiteSession();
    initialWebsiteSessionRequest = request;
    const next = await request;
    if (initialWebsiteSessionRequest !== request) return;
    initialWebsiteSessionRequest = Promise.resolve(next);
    setData(next);
    setIsPending(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const request = loadInitialWebsiteSession();
    void request.then((next) => {
      if (cancelled || initialWebsiteSessionRequest !== request) return;
      setData(next);
      setIsPending(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<WebsiteSessionContextValue>(() => ({
    data,
    isPending,
    refetch,
  }), [data, isPending, refetch]);

  return createElement(WebsiteSessionContext.Provider, { value }, children);
}

export function useWebsiteSession(): WebsiteSessionContextValue {
  const value = useContext(WebsiteSessionContext);
  if (!value) throw new Error("网站 Session 必须在 WebsiteSessionProvider 内使用。");
  return value;
}
