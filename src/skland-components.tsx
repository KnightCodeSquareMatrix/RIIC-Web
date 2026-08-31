"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  Check,
  Clipboard,
  ExternalLink,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

import { importSklandCredential, pollSklandQr, startSklandQr, toDisplayError } from "@/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { buildSklandAppOpenUrl } from "@/skland-auth-url";
import type { SklandSessionData } from "@/types";
import { PRIVACY_VERSION, TERMS_VERSION, type SklandPolicyConsentRequest } from "@/legal-policy";

const SKLAND_QR_POLL_INTERVAL_MS = 6_000;
export const SKLAND_CREDENTIAL_COPY_COMMAND = 'copy([localStorage.getItem("SK_OAUTH_CRED_KEY"), localStorage.getItem("SK_TOKEN_CACHE_KEY")].join(","))';

type ScanState = "idle" | "loading" | "waiting" | "scanned" | "expired";
type AuthMethod = "qr" | "credential";
type ImportState = "idle" | "submitting";

interface SklandLoginPanelProps {
  configured: boolean;
  disabledReason?: string | null;
  onAuthenticated: (session: SklandSessionData) => void;
  className?: string;
  dialogPresentation?: boolean;
}

function policyConsent(): SklandPolicyConsentRequest {
  return {
    termsAccepted: true,
    privacyAccepted: true,
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
  };
}

function PolicyConsent({
  termsAccepted,
  privacyAccepted,
  onTermsChange,
  onPrivacyChange,
}: {
  termsAccepted: boolean;
  privacyAccepted: boolean;
  onTermsChange: (accepted: boolean) => void;
  onPrivacyChange: (accepted: boolean) => void;
}) {
  const termsId = useId();
  const privacyId = useId();
  return (
    <div className="grid w-full gap-3 text-start text-xs leading-5 text-muted-foreground" data-skland-policy-consent>
      <div className="flex items-start gap-2">
        <input
          id={termsId}
          type="checkbox"
          checked={termsAccepted}
          onChange={(event) => onTermsChange(event.target.checked)}
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
          onChange={(event) => onPrivacyChange(event.target.checked)}
          className="mt-1 size-4 shrink-0 accent-primary"
        />
        <label htmlFor={privacyId}>
          我已阅读
          <Link className="mx-1 font-medium text-foreground underline underline-offset-4" href="/privacy" target="_blank">本站隐私政策</Link>
          ，并同意本站为登录和数据同步处理我的森空岛凭证、角色、干员与基建数据。
        </label>
      </div>
    </div>
  );
}

export function SklandLoginPanel({
  configured,
  disabledReason,
  onAuthenticated,
  className,
  dialogPresentation = false,
}: SklandLoginPanelProps) {
  const sklandAppOpenUrl = buildSklandAppOpenUrl();
  const [authMethod, setAuthMethod] = useState<AuthMethod>("qr");
  const [scanId, setScanId] = useState<string | null>(null);
  const [scanUrl, setScanUrl] = useState<string | null>(null);
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanExpiresAt, setScanExpiresAt] = useState<number | null>(null);
  const [preparingSlow, setPreparingSlow] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [credential, setCredential] = useState("");
  const [importState, setImportState] = useState<ImportState>("idle");
  const [importError, setImportError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const credentialInputId = useId();
  const createQrPromiseRef = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(true);
  const consentReady = termsAccepted && privacyAccepted;

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
        const result = await startSklandQr(policyConsent());
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
    if (!scanId || authMethod !== "qr") return;
    let cancelled = false;
    let timer: number | null = null;
    const poll = async () => {
      try {
        const result = await pollSklandQr(scanId);
        if (cancelled) return;
        if (
          result.status === "authenticated"
          && result.scheduleSnapshot
          && result.accounts
          && result.activeAccountId
        ) {
          onAuthenticated({
            authenticated: true,
            configured: true,
            authMethods: { qr: true, credential: true },
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
  }, [authMethod, onAuthenticated, scanId]);

  useEffect(() => {
    if (
      authMethod !== "qr"
      || dialogPresentation
      || !configured
      || !consentReady
      || scanError
      || (scanState !== "idle" && scanState !== "expired")
    ) {
      return;
    }
    void createQr();
  }, [authMethod, configured, consentReady, createQr, dialogPresentation, scanError, scanState]);

  async function copyCredentialCommand() {
    try {
      await navigator.clipboard.writeText(SKLAND_CREDENTIAL_COPY_COMMAND);
      setCopyState("copied");
      window.setTimeout(() => {
        if (mountedRef.current) setCopyState("idle");
      }, 2_000);
    } catch {
      setCopyState("error");
    }
  }

  async function submitCredential(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!consentReady || !credential.trim() || importState === "submitting") return;
    setImportState("submitting");
    setImportError(null);
    try {
      const session = await importSklandCredential(credential, policyConsent());
      if (!mountedRef.current) return;
      setCredential("");
      onAuthenticated(session);
    } catch (error) {
      if (!mountedRef.current) return;
      const detail = toDisplayError(error, "凭证导入失败，请稍后重试。");
      setImportError(`${detail.message}（${detail.code}${detail.requestId ? ` · ${detail.requestId}` : ""}）`);
    } finally {
      if (mountedRef.current) setImportState("idle");
    }
  }

  const pageStatusText = scanState === "loading"
    ? preparingSlow ? "正在连接登录服务，请稍候…" : "正在生成二维码…"
    : scanState === "scanned"
      ? "已扫码，正在等待森空岛 App 确认并完成登录…"
      : scanState === "expired"
        ? dialogPresentation ? "二维码已过期，请重新生成。" : "二维码已过期，正在刷新…"
        : scanUrl
          ? "请使用森空岛 App 扫描二维码"
          : dialogPresentation ? "准备好后生成二维码。" : "勾选下方两项授权后显示二维码";

  return (
    <Card
      className={cn(
        "w-full overflow-hidden rounded-none border-0 bg-transparent shadow-none ring-0",
        className,
      )}
      data-skland-login-panel
    >
      <div className="grid gap-5 px-5 pb-6 pt-5 sm:px-7 sm:pb-7">
        <div className="flex items-start gap-3" data-skland-auth-copy>
          <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            {authMethod === "qr" ? <ScanLine className="size-5" aria-hidden="true" /> : <KeyRound className="size-5" aria-hidden="true" />}
          </div>
          <div className="min-w-0">
            <CardTitle className={dialogPresentation ? "text-lg" : "text-xl"}>登录森空岛账号</CardTitle>
            <CardDescription className="mt-1 text-pretty leading-6">
              登录信息经加密写入 HttpOnly Cookie，并在授权成功 7 天后固定失效。
            </CardDescription>
          </div>
        </div>

        {!configured ? (
          <Alert>
            <AlertDescription>{disabledReason ?? "当前未开放森空岛登录，可继续使用 MAA 导入。"}</AlertDescription>
          </Alert>
        ) : (
          <Tabs value={authMethod} onValueChange={(value) => setAuthMethod(value as AuthMethod)}>
            <TabsList className="grid w-full grid-cols-2" aria-label="森空岛登录方式">
              <TabsTrigger value="qr"><ScanLine />扫码登录</TabsTrigger>
              <TabsTrigger value="credential"><KeyRound />凭证导入</TabsTrigger>
            </TabsList>

            <TabsContent value="qr" className="mt-4">
              <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_15rem] md:items-center" data-skland-login-qr>
                <div className="order-2 grid gap-4 md:order-1">
                  <p className="flex items-start gap-2 text-sm leading-6 text-muted-foreground">
                    <ShieldCheck className="mt-1 size-4 shrink-0 text-emerald-600" aria-hidden="true" />
                    <span>推荐方式。打开森空岛 App 扫描二维码，确认后同步当前角色的干员、基建与状态中心数据。</span>
                  </p>
                  <PolicyConsent
                    termsAccepted={termsAccepted}
                    privacyAccepted={privacyAccepted}
                    onTermsChange={setTermsAccepted}
                    onPrivacyChange={setPrivacyAccepted}
                  />
                  {scanError ? <Alert variant="destructive"><AlertDescription>{scanError}</AlertDescription></Alert> : null}
                  {scanUrl ? (
                    <div className="grid gap-2 sm:hidden">
                      <Button
                        nativeButton={false}
                        render={<a data-motion-pressable href={sklandAppOpenUrl} target="_blank" rel="noreferrer" />}
                        size={dialogPresentation ? "dialog" : "default"}
                        className="w-full"
                      >
                        <ExternalLink />打开森空岛 App
                      </Button>
                      <p className="text-pretty text-center text-xs leading-5 text-muted-foreground">
                        请用森空岛扫描二维码；必要时可在另一台设备展示。
                      </p>
                    </div>
                  ) : null}
                  {!scanUrl || scanState === "expired" || scanError ? (
                    <Button
                      type="button"
                      size={dialogPresentation ? "dialog" : "default"}
                      className={cn("w-full sm:w-fit", dialogPresentation && "sm:w-[196px]")}
                      variant={scanState === "idle" && !scanError ? "default" : "outline"}
                      disabled={scanState === "loading" || !consentReady}
                      onClick={() => void createQr()}
                    >
                      {scanState === "loading" ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
                      {scanState === "idle" && !scanError ? "生成登录二维码" : "重新生成二维码"}
                    </Button>
                  ) : null}
                </div>

                <div className="order-1 grid place-items-center gap-3 md:order-2">
                  <div className="grid size-52 place-items-center rounded-xl bg-white p-3 ring-1 ring-black/10 sm:size-56 md:size-52" data-skland-qr-visual>
                    {scanState === "scanned" ? (
                      <LoaderCircle className="size-9 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden="true" data-skland-login-progress />
                    ) : scanUrl ? (
                      <QRCodeSVG value={scanUrl} size={196} className="size-full" title="森空岛登录二维码" role="img" aria-label="森空岛登录二维码" />
                    ) : scanState === "loading" ? (
                      <LoaderCircle className="size-8 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden="true" />
                    ) : (
                      <ScanLine className="size-12 text-muted-foreground" aria-hidden="true" />
                    )}
                  </div>
                  <p className="text-center text-sm leading-6 text-muted-foreground" role="status" aria-live="polite">{pageStatusText}</p>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="credential" className="mt-4" data-skland-credential-panel>
              <form className="grid gap-5" onSubmit={(event) => void submitCredential(event)}>
                <Alert className="md:hidden">
                  <ScanLine />
                  <AlertTitle>手机端优先使用扫码</AlertTitle>
                  <AlertDescription>凭证导入需要桌面浏览器的开发者工具，手机上建议切回“扫码登录”。</AlertDescription>
                </Alert>

                <ol className="grid gap-4 text-sm leading-6">
                  <li className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3">
                    <span className="font-number grid size-7 place-items-center rounded-full bg-foreground text-xs font-semibold text-background">1</span>
                    <div>
                      <p className="font-medium text-foreground">登录森空岛网页版</p>
                      <p className="text-muted-foreground">打开 <a className="font-medium text-foreground underline underline-offset-4" href="https://www.skland.com/index" target="_blank" rel="noreferrer">www.skland.com/index</a> 并完成登录。</p>
                    </div>
                  </li>
                  <li className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3">
                    <span className="font-number grid size-7 place-items-center rounded-full bg-foreground text-xs font-semibold text-background">2</span>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">在 F12 Console 执行命令</p>
                      <p className="text-muted-foreground">打开开发者工具的 Console，将下方命令粘贴并执行。它只读取森空岛页面已有的 cred 与 token，并复制为一行。</p>
                      <div className="mt-2 flex min-w-0 items-stretch gap-2">
                        <code className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap rounded-lg bg-muted px-3 py-2 font-number text-xs text-foreground" title={SKLAND_CREDENTIAL_COPY_COMMAND}>{SKLAND_CREDENTIAL_COPY_COMMAND}</code>
                        <Button type="button" variant="outline" size="sm" onClick={() => void copyCredentialCommand()} data-skland-copy-command>
                          {copyState === "copied" ? <Check /> : <Clipboard />}
                          {copyState === "copied" ? "已复制" : "复制命令"}
                        </Button>
                      </div>
                      {copyState === "error" ? <p className="mt-1 text-xs text-destructive">复制失败，请手动选择命令复制。</p> : null}
                    </div>
                  </li>
                  <li className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3">
                    <span className="font-number grid size-7 place-items-center rounded-full bg-foreground text-xs font-semibold text-background">3</span>
                    <div>
                      <label className="font-medium text-foreground" htmlFor={credentialInputId}>粘贴生成的单行凭证</label>
                      <p className="text-muted-foreground">内容应为 <span className="font-number">cred,token</span>，仅在本次请求和当前组件内存中短暂存在。</p>
                      <Input
                        id={credentialInputId}
                        type="password"
                        value={credential}
                        onChange={(event) => setCredential(event.target.value)}
                        placeholder="粘贴 cred,token"
                        autoComplete="off"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        maxLength={12 * 1024}
                        className="mt-2 h-11 font-number"
                        aria-invalid={Boolean(importError)}
                        data-skland-credential-input
                      />
                    </div>
                  </li>
                </ol>

                <div className="grid gap-3 border-y py-4">
                  <div className="flex items-start gap-2">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
                    <div>
                      <p className="font-medium text-foreground">凭证等同登录权限，请勿发送给任何人</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">泄露后可能被用于访问账号与角色、干员练度、基建排班及仓库物资数量等数据。</p>
                    </div>
                  </div>
                  <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-4" aria-label="凭证可能访问的数据">
                    <li>账号与角色</li>
                    <li>干员练度</li>
                    <li>基建与排班</li>
                    <li>仓库物资数量</li>
                  </ul>
                  <p className="text-xs font-medium leading-5 text-foreground">本站实际不读取、不保存、不展示仓库数据，也不签到、不发布或操作任何社区内容。</p>
                </div>

                <PolicyConsent
                  termsAccepted={termsAccepted}
                  privacyAccepted={privacyAccepted}
                  onTermsChange={setTermsAccepted}
                  onPrivacyChange={setPrivacyAccepted}
                />

                {importError ? <Alert variant="destructive"><AlertDescription>{importError}</AlertDescription></Alert> : null}

                <Button
                  type="submit"
                  size={dialogPresentation ? "dialog" : "default"}
                  className={cn("w-full sm:w-fit", dialogPresentation && "sm:w-[196px]")}
                  disabled={!consentReady || !credential.trim() || importState === "submitting"}
                  data-skland-credential-submit
                >
                  {importState === "submitting" ? <LoaderCircle className="animate-spin motion-reduce:animate-none" /> : <KeyRound />}
                  {importState === "submitting" ? "正在验证凭证…" : "导入并登录"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </Card>
  );
}
