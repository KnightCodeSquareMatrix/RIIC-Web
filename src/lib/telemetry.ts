// 轻量埋点 SDK：批量 + sendBeacon，当前记录全部性能事件，不阻塞主线程。
// 只采集白名单事件；字段校验在服务端 /api/telemetry 完成。

import {
  TELEMETRY_SESSION_STORAGE_KEY,
  type TelemetryInput,
  type TelemetryType,
} from "@/telemetry-contract";

const TELEMETRY_ENDPOINT = "/api/telemetry";
const FLUSH_INTERVAL_MS = 5_000;
const FLUSH_BATCH_SIZE = 20;
const PERFORMANCE_SAMPLE_RATE = 1;

/** 设备环境快照：会话级一条，不随每条事件重复上报。 */
function collectDeviceInfo(): Record<string, string | number | boolean> {
  const info: Record<string, string | number | boolean> = {};
  const uaData = (navigator as Navigator & {
    userAgentData?: { mobile?: boolean; platform?: string; brands?: Array<{ brand: string; version: string }> };
  }).userAgentData;
  const ua = navigator.userAgent;
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;

  // 设备类型：优先 UA-CH mobile，其次按指针能力推断触屏设备。
  if (uaData?.mobile) {
    info.device_type = "mobile";
  } else if (coarsePointer && !finePointer) {
    info.device_type = "mobile";
  } else if (coarsePointer && finePointer) {
    info.device_type = "tablet";
  } else {
    info.device_type = "desktop";
  }

  const platform = uaData?.platform ?? "";
  if (platform === "Windows" || /Windows/.test(ua)) info.os = "windows";
  else if (platform === "macOS" || /Mac OS X|Macintosh/.test(ua)) info.os = "macos";
  else if (/Android/.test(ua)) info.os = "android";
  else if (/iPhone|iPad|iPod/.test(ua)) info.os = "ios";
  else if (/Linux/.test(ua)) info.os = "linux";
  else info.os = "unknown";

  if (/Edg\//.test(ua)) info.browser = "edge";
  else if (/Firefox\//.test(ua)) info.browser = "firefox";
  else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) info.browser = "chrome";
  else if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) info.browser = "safari";
  else info.browser = "unknown";

  info.screen_width = window.screen.width;
  info.screen_height = window.screen.height;
  info.dpr = window.devicePixelRatio || 1;
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (typeof deviceMemory === "number") info.memory_gb = deviceMemory;
  const cores = (navigator as Navigator & { hardwareConcurrency?: number }).hardwareConcurrency;
  if (typeof cores === "number") info.cores = cores;
  const connection = (navigator as Navigator & {
    connection?: { effectiveType?: string; saveData?: boolean };
  }).connection;
  if (connection?.effectiveType) info.effective_type = connection.effectiveType;
  if (typeof connection?.saveData === "boolean") info.save_data = connection.saveData;
  return info;
}

type QueuedEvent = TelemetryInput & {
  sessionId: string;
};

const queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let fallbackSessionId: string | null = null;

function getSessionId(): string {
  try {
    let value = window.localStorage.getItem(TELEMETRY_SESSION_STORAGE_KEY);
    if (!value) {
      value = crypto.randomUUID();
      window.localStorage.setItem(TELEMETRY_SESSION_STORAGE_KEY, value);
    }
    return value;
  } catch {
    return fallbackSessionId ??= crypto.randomUUID();
  }
}

function shouldSample(type: TelemetryType): boolean {
  return type !== "performance" || Math.random() < PERFORMANCE_SAMPLE_RATE;
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushTelemetry();
  }, FLUSH_INTERVAL_MS);
}

export function track(input: TelemetryInput): void {
  if (!shouldSample(input.type)) return;
  queue.push({
    ...input,
    sessionId: getSessionId(),
  });
  if (queue.length >= FLUSH_BATCH_SIZE) {
    void flushTelemetry();
  } else {
    scheduleFlush();
  }
}

/** 手动立即上报（页面卸载前调用，防止丢数据）。 */
export function flushTelemetry(): void {
  if (queue.length === 0) return;
  const events = queue.splice(0, FLUSH_BATCH_SIZE);
  const payload = { events };
  try {
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    if (navigator.sendBeacon(TELEMETRY_ENDPOINT, blob)) return;
  } catch {
    // sendBeacon 不可用时走 fetch 兜底
  }
  void fetch(TELEMETRY_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    // 上报失败直接丢弃，避免重试循环拖累页面。
  });
}

// 页面卸载/隐藏前冲刷剩余队列。
if (typeof window !== "undefined") {
  track({ type: "environment", name: "device_info", meta: collectDeviceInfo() });
  window.addEventListener("pagehide", () => flushTelemetry());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushTelemetry();
  });
}
