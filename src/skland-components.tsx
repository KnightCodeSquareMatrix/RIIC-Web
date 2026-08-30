"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ExternalLink, LoaderCircle, RefreshCw, ScanLine, ShieldCheck } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

import { pollSklandQr, startSklandQr, toDisplayError } from "@/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { buildSklandAppOpenUrl } from "@/skland-auth-url";
import type { SklandSessionData } from "@/types";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/legal-policy";

const SKLAND_QR_POLL_INTERVAL_MS = 6_000;

type ScanState = "idle" | "loading" | "waiting" | "scanned" | "expired";

interface SklandLoginPanelProps {
  configured: boolean;
  disabledReason?: string | null;
  onAuthenticated: (session: SklandSessionData) => void;
  className?: string;
  dialogPresentation?: boolean;
}

export function SklandLoginPanel({
  configured,
  disabledReason,
  onAuthenticated,
  className,
  dialogPresentation = false,
}: SklandLoginPanelProps) {
  const sklandAppOpenUrl = buildSklandAppOpenUrl();
  const [scanId, setScanId] = useState<string | null>(null);
  const [scanUrl, setScanUrl] = useState<string | null>(null);
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanExpiresAt, setScanExpiresAt] = useState<number | null>(null);
  const [preparingSlow, setPreparingSlow] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const termsId = useId();
  const privacyId = useId();
  const createQrPromiseRef = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const createQr = useCallback(() => {
    if (createQrPromiseRef.current) return createQrPromiseRef.current;
    const task = (async () => {
      setScanError(null);
      setScanState("loading");
      setScanId(null);
      setScanUrl(null);
      setScanExpiresAt(null);
      try {
        const result = await startSklandQr({
          termsAccepted: true,
          privacyAccepted: true,
          termsVersion: TERMS_VERSION,
          privacyVersion: PRIVACY_VERSION,
        });
        if (!mountedRef.current) return;
        setScanId(result.scanId);
        setScanUrl(result.scanUrl);
        setScanExpiresAt(Date.now() + result.expiresInSeconds * 1000);
        setScanState("waiting");
      } catch (error) {
        if (!mountedRef.current) return;
        const detail = toDisplayError(error, "二维码生成失败，请稍后重试。");
        setScanState("idle");
        setScanError(`${detail.message}（${detail.code}${detail.requestId ? ` · ${detail.requestId}` : ""}）`);
      }
    })();
    createQrPromiseRef.current = task;
    void task.finally(() => {
      if (createQrPromiseRef.current === task) createQrPromiseRef.current = null;
    });
    return task;
  }, []);

  useEffect(() => {
    if (scanState !== "loading") {
      setPreparingSlow(false);
      return;
    }
    const timer = window.setTimeout(() => setPreparingSlow(true), 2_000);
    return () => window.clearTimeout(timer);
  }, [scanState]);

  useEffect(() => {
    if (!scanId || !scanExpiresAt) return;
    const remaining = scanExpiresAt - Date.now();
    if (remaining <= 0) {
      setScanId(null);
      setScanState("expired");
      return;
    }
    const timer = window.setTimeout(() => {
      setScanId(null);
      setScanState("expired");
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [scanExpiresAt, scanId]);

  useEffect(() => {
    if (!scanId) return;
    let cancelled = false;
    let timer: number | null = null;
    const poll = async () => {
      try {
        const result = await pollSklandQr(scanId);
        if (cancelled) return;
        if (
          result.status === "authenticated" &&
          result.scheduleSnapshot &&
          result.accounts &&
          result.activeAccountId
        ) {
          onAuthenticated({
            authenticated: true,
            configured: true,
            accounts: result.accounts,
            activeAccountId: result.activeAccountId,
            bindingCount: result.bindingCount ?? result.accounts.length,
            bindingSummary: result.bindingSummary,
            scheduleSnapshot: result.scheduleSnapshot,
            statusSnapshot: result.statusSnapshot,
          });
          setScanId(null);
          setScanUrl(null);
          setScanExpiresAt(null);
          setScanState("idle");
          setScanError(null);
          return;
        }
        if (result.status === "expired") {
          setScanId(null);
          setScanState("expired");
          setScanError(null);
          return;
        }
        setScanState(result.status === "scanned" ? "scanned" : "waiting");
        setScanError(null);
      } catch (error) {
        if (cancelled) return;
        const detail = toDisplayError(error, "登录状态查询失败，将继续重试。");
        setScanError(`${detail.message}（${detail.code}${detail.requestId ? ` · ${detail.requestId}` : ""}）`);
      }
      if (!cancelled) timer = window.setTimeout(() => void poll(), SKLAND_QR_POLL_INTERVAL_MS);
    };
    timer = window.setTimeout(() => void poll(), SKLAND_QR_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [onAuthenticated, scanId]);

  useEffect(() => {
    if (
      dialogPresentation ||
      !configured ||
      !termsAccepted ||
      !privacyAccepted ||
      scanError ||
      (scanState !== "idle" && scanState !== "expired")
    ) {
      return;
    }
    void createQr();
  }, [
    configured,
    createQr,
    dialogPresentation,
    privacyAccepted,
    scanError,
    scanState,
    termsAccepted,
  ]);

  const pageStatusText = scanState === "loading"
    ? preparingSlow
      ? "正在连接登录服务，请稍候…"
      : "正在生成二维码…"
    : scanState === "scanned"
      ? "已扫码，正在等待森空岛 App 确认并完成登录…"
      : scanState === "expired"
        ? "二维码已过期，正在刷新…"
        : scanUrl
          ? "请使用森空岛 App 扫描二维码"
          : "勾选下方两项授权后显示二维码";

  if (!dialogPresentation) {
    return (
      <div
        className={cn("grid w-full justify-items-center", className)}
        data-skland-login-panel
      >
        {!configured ? (
          <Alert className="w-full max-w-md text-start">
            <AlertDescription>
              {disabledReason ?? "当前未开放森空岛登录，可继续使用 MAA 导入。"}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid w-full max-w-md justify-items-center gap-5" data-skland-login-qr>
            <div
              className="grid size-52 place-items-center rounded-xl bg-white p-3 ring-1 ring-black/10 sm:size-56"
              data-skland-qr-visual
            >
              {scanState === "scanned" ? (
                <LoaderCircle
                  className="size-9 animate-spin text-muted-foreground motion-reduce:animate-none"
                  aria-hidden="true"
                  data-skland-login-progress
                />
              ) : scanUrl ? (
                <QRCodeSVG
                  value={scanUrl}
                  size={196}
                  className="size-full"
                  title="森空岛登录二维码"
                  role="img"
                  aria-label="森空岛登录二维码"
                />
              ) : scanState === "loading" ? (
                <LoaderCircle className="size-8 animate-spin text-muted-foreground" aria-hidden="true" />
              ) : (
                <ScanLine className="size-12 text-muted-foreground" aria-hidden="true" />
              )}
            </div>

            <p className="text-center text-sm leading-6 text-muted-foreground" role="status" aria-live="polite">
              {pageStatusText}
            </p>

            {scanError ? (
              <Alert className="w-full text-start" variant="destructive">
                <AlertDescription>{scanError}</AlertDescription>
              </Alert>
            ) : null}

            <div className="grid w-full gap-3 text-start text-xs leading-5 text-muted-foreground">
              <div className="flex items-start gap-2">
                <input
                  id={termsId}
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(event) => setTermsAccepted(event.target.checked)}
                  className="mt-1 size-4 shrink-0 accent-primary"
                />
                <label htmlFor={termsId}>
                  我已阅读并同意
                  <Link className="mx-1 font-medium text-foreground underline underline-offset-4" href="/terms" target="_blank">本站服务条款</Link>
                  。
                </label>
              </div>
              <div className="flex items-start gap-2">
                <input
                  id={privacyId}
                  type="checkbox"
                  checked={privacyAccepted}
                  onChange={(event) => setPrivacyAccepted(event.target.checked)}
                  className="mt-1 size-4 shrink-0 accent-primary"
                />
                <label htmlFor={privacyId}>
                  我已阅读
                  <Link className="mx-1 font-medium text-foreground underline underline-offset-4" href="/privacy" target="_blank">本站隐私政策</Link>
                  ，并授权本站处理森空岛凭证、角色、干员与基建数据。
                </label>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const statusText = scanState === "loading"
    ? preparingSlow
      ? "正在连接鹰角登录服务，首次准备可能需要更久。"
      : "正在生成二维码…"
    : scanState === "scanned"
      ? "已扫码，正在等待森空岛确认并完成登录。"
      : scanState === "expired"
        ? "二维码已过期，请重新生成。"
        : scanUrl
          ? "等待森空岛扫码授权…"
          : "二维码不会自动生成，准备好后再开始登录。";
  const mobileStatusText = scanState === "loading"
    ? preparingSlow
      ? "正在连接登录服务…"
      : "正在生成二维码…"
    : scanState === "scanned"
      ? "已扫码，正在等待确认并完成登录…"
      : scanState === "expired"
        ? "二维码已过期，请重新生成。"
        : scanUrl
          ? "等待扫码确认…"
          : "点击按钮生成二维码。";

  return (
    <Card
      className={cn(
        dialogPresentation
          ? "w-full overflow-hidden rounded-none border-0 bg-transparent shadow-none ring-0"
          : "surface-shadow w-full overflow-hidden rounded-none ring-0",
        className
      )}
      data-skland-login-panel
    >
      <div className="grid md:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="px-6 py-7 md:px-8 md:py-9" data-skland-login-copy>
          <div className="mb-5 flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ScanLine className="size-5" aria-hidden="true" />
          </div>
          <CardTitle className={dialogPresentation ? "text-lg" : "text-xl"}>登录森空岛账号</CardTitle>
          <div className="mt-7 grid gap-4 text-sm text-muted-foreground" data-ui-number-font>
            <p className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden="true" />
              <span>登录信息会加密保存在你的浏览器中，7 天后自动失效；本站不会另行长期保存。</span>
            </p>
            <CardDescription className="w-full text-pretty leading-6">
              <span className="md:hidden">打开森空岛 App 扫码登录，成功后同步排班与状态中心数据。</span>
              <span className="hidden md:inline">
                打开森空岛 App，扫描页面中的二维码完成登录。登录成功后会同步当前角色的干员、基建布局和状态中心完整数据。
              </span>
            </CardDescription>
          </div>
        </div>

        <CardContent
          className="order-first grid min-h-64 place-items-center px-6 py-7 md:order-none md:min-h-80 md:px-8"
          data-skland-login-qr
        >
          {!configured ? (
            <Alert>
              <AlertDescription>
                {disabledReason ?? "当前未开放森空岛登录，可继续使用 MAA 导入。"}
              </AlertDescription>
            </Alert>
          ) : (
            <div className="grid w-full place-items-center gap-4">
              {scanUrl || scanState === "loading" ? (
                <div className="grid size-52 place-items-center rounded-xl bg-white p-3 ring-1 ring-black/10 sm:size-56">
                  {scanState === "scanned" ? (
                    <LoaderCircle
                      className="size-9 animate-spin text-muted-foreground motion-reduce:animate-none"
                      aria-hidden="true"
                      data-skland-login-progress
                    />
                  ) : scanUrl ? (
                    <QRCodeSVG
                      value={scanUrl}
                      size={196}
                      className="size-full"
                      title="森空岛登录二维码"
                      role="img"
                      aria-label="森空岛登录二维码"
                    />
                  ) : (
                    <LoaderCircle className="size-8 animate-spin text-muted-foreground" aria-hidden="true" />
                  )}
                </div>
              ) : (
                <div className="grid size-36 place-items-center rounded-full bg-muted text-muted-foreground">
                  <ScanLine className="size-12" aria-hidden="true" />
                </div>
              )}

              <p className="text-center text-sm leading-6 text-muted-foreground" role="status" aria-live="polite">
                <span className="md:hidden">{mobileStatusText}</span>
                <span className="hidden md:inline">{statusText}</span>
              </p>

              {scanError ? (
                <Alert variant="destructive">
                  <AlertDescription>{scanError}</AlertDescription>
                </Alert>
              ) : null}

              <div className="grid w-full gap-3 text-xs leading-5 text-muted-foreground">
                <div className="flex items-start gap-2">
                  <input
                    id={termsId}
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(event) => setTermsAccepted(event.target.checked)}
                    className="mt-1 size-4 shrink-0 accent-primary"
                  />
                  <label htmlFor={termsId}>
                    我已阅读并同意
                    <Link className="mx-1 font-medium text-foreground underline underline-offset-4" href="/terms" target="_blank">本站服务条款</Link>
                    。
                  </label>
                </div>
                <div className="flex items-start gap-2">
                  <input
                    id={privacyId}
                    type="checkbox"
                    checked={privacyAccepted}
                    onChange={(event) => setPrivacyAccepted(event.target.checked)}
                    className="mt-1 size-4 shrink-0 accent-primary"
                  />
                  <label htmlFor={privacyId}>
                    我已阅读
                    <Link className="mx-1 font-medium text-foreground underline underline-offset-4" href="/privacy" target="_blank">本站隐私政策</Link>
                    ，并同意本站为登录和生成排班处理我的森空岛凭证、角色、干员与基建数据。
                  </label>
                </div>
              </div>

              {scanUrl ? (
                <div className="grid w-full gap-2 sm:hidden">
                  <Button
                    nativeButton={false}
                    render={(
                      <a
                        data-motion-pressable
                        href={sklandAppOpenUrl}
                        target="_blank"
                        rel="noreferrer"
                      />
                    )}
                    size={dialogPresentation ? "dialog" : "default"}
                    className="w-full"
                  >
                    <ExternalLink />打开森空岛 App
                  </Button>
                  <p className="text-pretty text-center text-xs leading-5 text-muted-foreground">
                    请用森空岛扫描上方二维码；必要时可在另一台设备展示。
                  </p>
                </div>
              ) : null}

              {!scanUrl || scanState === "expired" || scanError ? (
                <Button
                  type="button"
                  size={dialogPresentation ? "dialog" : "default"}
                  className={dialogPresentation ? undefined : "h-11 min-w-36"}
                  variant={scanState === "idle" && !scanError ? "default" : "outline"}
                  disabled={scanState === "loading" || !termsAccepted || !privacyAccepted}
                  onClick={() => void createQr()}
                >
                  {scanState === "loading" ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
                  <span className="md:hidden">
                    {scanState === "idle" && !scanError ? "生成二维码" : "重新生成"}
                  </span>
                  <span className="hidden md:inline">
                    {scanState === "idle" && !scanError ? "生成登录二维码" : "重新生成二维码"}
                  </span>
                </Button>
              ) : null}
            </div>
          )}
        </CardContent>
      </div>
    </Card>
  );
}
