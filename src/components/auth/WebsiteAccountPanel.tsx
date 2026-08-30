"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  LogOut,
  MailCheck,
  MonitorSmartphone,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";

import {
  WEBSITE_ACCOUNT_NAME_HINT,
  WEBSITE_ACCOUNT_NAME_MAX_LENGTH,
  WEBSITE_ACCOUNT_NAME_MIN_LENGTH,
  validateWebsiteAccountName,
} from "@/account-name";
import { accountOrbColor } from "@/account-orb";
import { cloudSyncMetadataKey } from "@/cloud-sync";
import { WebsiteAccountLoadingStatus } from "@/components/auth/WebsiteAccountDialogLoading";
import { OtpInput, type OtpInputHandle, type OtpStatus } from "@/components/interior/otp-input";
import { PasswordStrength } from "@/components/interior/password-strength";
import { WizardSteps } from "@/components/interior/wizard-steps";
import {
  InfraTechnicalCard as AccountTechnicalCard,
  InfraTechnicalHeading as AccountTechnicalHeading,
} from "@/components/InfraTechnicalCard";
import { StatusCenterHeader, StatusCenterLoading } from "@/components/pages/StatusCenterShell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FluidOrb } from "@/components/ui/fluid-orb";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/legal-policy";
import { clearLocalProductData } from "@/persistence";
import { CloudDataPanel } from "@/components/cloud/CloudDataPanel";
import type { CloudWorkspaceData, SavedPlanData } from "@/types";
import { useWebsiteSession } from "@/website-session";

type AuthMode = "signin" | "signup" | "forgot";
type AuthStep = "details" | "verify" | "complete";
type AccountAction = "signout" | "sessions" | "delete";

const MODE_COPY: Record<AuthMode, { title: string; description: string }> = {
  signin: { title: "登录网站账号", description: "继续使用受账号保护的数据导入与排班功能。" },
  signup: { title: "创建网站账号", description: "填写账号信息后，我们会向邮箱发送 6 位验证码。" },
  forgot: { title: "找回密码", description: "输入注册邮箱，我们会发送一封 1 小时内有效的重置邮件。" },
};

const AUTH_INPUT_CLASS = "border-[#d5d7da] bg-white shadow-none dark:border-[#d5d7da] dark:bg-white dark:text-[#242424] dark:placeholder:text-[#737373]";

interface WebsiteAccountPanelProps {
  onSessionChanged?: (authenticated: boolean) => void | Promise<void>;
  loadingMode?: "page" | "dialog";
  cloudWorkspace?: CloudWorkspaceData | null;
  onRestoreSavedPlan?: (plan: SavedPlanData) => void;
  onCloudDataChanged?: () => void;
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : "操作失败，请稍后重试。";
}

function formatSessionExpiry(value: unknown): string | null {
  if (!(value instanceof Date) && typeof value !== "string") return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function WebsiteAccountPanel({
  onSessionChanged,
  loadingMode = "page",
  cloudWorkspace,
  onRestoreSavedPlan,
  onCloudDataChanged,
}: WebsiteAccountPanelProps) {
  const { data: session, isPending, refetch } = useWebsiteSession();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [step, setStep] = useState<AuthStep>("details");
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpStatus, setOtpStatus] = useState<OtpStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyAction, setBusyAction] = useState<AccountAction | null>(null);
  const [deleteLocalData, setDeleteLocalData] = useState(true);
  const [resendSeconds, setResendSeconds] = useState(0);
  const otpRef = useRef<OtpInputHandle>(null);
  const fieldId = useId();

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setInterval(() => setResendSeconds((current) => Math.max(0, current - 1)), 1_000);
    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  function chooseMode(nextMode: AuthMode) {
    setMode(nextMode);
    setStep("details");
    setPassword("");
    setNameError(null);
    setOtp("");
    setOtpStatus("idle");
    setMessage(null);
    setError(null);
  }

  async function notifySessionChanged(authenticated: boolean) {
    if (onSessionChanged) await onSessionChanged(authenticated);
    else await refetch();
  }

  async function sendVerificationCode() {
    if (!email.trim()) {
      setError("请先输入要验证的邮箱。");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email: email.trim(),
        type: "email-verification",
      });
      if (result.error) throw new Error(result.error.message);
      setStep("verify");
      setOtp("");
      setOtpStatus("idle");
      otpRef.current?.clear();
      setResendSeconds(60);
      setMessage("验证码已发送，请在 10 分钟内完成验证。");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function submitDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validatedName = mode === "signup" ? validateWebsiteAccountName(name) : null;
    if (validatedName?.error) {
      setNameError(validatedName.error);
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (mode === "forgot") {
        const result = await authClient.requestPasswordReset({
          email: email.trim(),
          redirectTo: `${location.origin}/account/reset-password`,
        });
        if (result.error) throw new Error(result.error.message);
        setStep("complete");
        setMessage("如果这个邮箱已注册，重置邮件会很快送达。");
      } else if (mode === "signup") {
        const result = await authClient.signUp.email({
          name: validatedName?.name ?? name.trim(),
          email: email.trim(),
          password,
          callbackURL: location.origin,
        });
        if (result.error) throw new Error(result.error.message);
        setStep("verify");
        setResendSeconds(60);
        setMessage("验证码已发送，请在 10 分钟内完成验证。");
      } else {
        const result = await authClient.signIn.email({
          email: email.trim(),
          password,
          callbackURL: location.href,
        });
        if (result.error) throw new Error(result.error.message);
        await notifySessionChanged(true);
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (otp.length !== 6) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    setOtpStatus("idle");
    try {
      const result = await authClient.emailOtp.verifyEmail({ email: email.trim(), otp });
      if (result.error) throw new Error(result.error.message);
      setOtpStatus("success");
      setStep("complete");
      setMessage("邮箱验证完成，现在可以登录网站账号。");
    } catch (caught) {
      setOtpStatus("error");
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function runAccountAction(action: AccountAction) {
    setBusyAction(action);
    setError(null);
    setMessage(null);
    try {
      const result = action === "signout"
        ? await authClient.signOut()
        : action === "sessions"
          ? await authClient.revokeSessions()
          : await authClient.deleteUser({ password: deletePassword, callbackURL: location.origin });
      if (result.error) throw new Error(result.error.message);
      if (action === "delete" && deleteLocalData && session?.user.id) {
        try {
          clearLocalProductData(window.localStorage);
          window.localStorage.removeItem(cloudSyncMetadataKey(session.user.id));
          window.localStorage.removeItem(`cloud-consent-dismissed:${session.user.id}:${TERMS_VERSION}:${PRIVACY_VERSION}`);
        } catch {
          // Account deletion has already succeeded; local storage can still be
          // cleared later from the calculator when browser access is restored.
        }
      }
      setDeletePassword("");
      await notifySessionChanged(false);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusyAction(null);
    }
  }

  if (isPending && !busy && !message && !error) {
    return loadingMode === "dialog"
      ? <WebsiteAccountLoadingStatus />
      : <StatusCenterLoading label="正在恢复网站账号" />;
  }

  if (session) {
    const expiresAt = formatSessionExpiry(session.session.expiresAt);
    const orbColor = accountOrbColor(session.user.id);
    return (
      <div className="grid gap-6" data-website-account-panel data-authenticated="true">
        <StatusCenterHeader
          identity={(
            <div className="flex min-w-0 items-center gap-4">
              <FluidOrb
                size={56}
                color={orbColor}
                aria-hidden="true"
                data-website-account-avatar
                data-account-orb-color={orbColor}
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-2xl font-semibold tracking-tight">{session.user.name}</h2>
                  <Badge variant="secondary"><ShieldCheck />邮箱已验证</Badge>
                </div>
                <p className="mt-1 break-all text-sm text-muted-foreground">{session.user.email}</p>
              </div>
            </div>
          )}
          actions={(
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full sm:w-auto"
              disabled={busyAction !== null}
              onClick={() => void runAccountAction("signout")}
              data-account-logout
            >
              <LogOut />{busyAction === "signout" ? "正在退出…" : "退出当前设备"}
            </Button>
          )}
        />

        {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
        {message ? <p role="status" className="text-sm text-muted-foreground">{message}</p> : null}

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]" data-account-action-cards>
          <AccountTechnicalCard group="control" className="min-h-64">
            <section className="flex h-full flex-col" aria-labelledby={`${fieldId}-devices`}>
              <AccountTechnicalHeading
                icon={<MonitorSmartphone className="size-4" aria-hidden="true" />}
                titleId={`${fieldId}-devices`}
              >
                登录设备
              </AccountTechnicalHeading>
              <p className="mt-4 max-w-xl text-sm leading-6 text-white/64">
                当前会话{expiresAt ? `将在 ${expiresAt} 到期` : "处于有效状态"}。退出全部设备会撤销数据库 Session，并清除当前浏览器保存的第三方账号凭据。
              </p>
              <div className="mt-auto flex justify-end pt-5">
                <Button
                  type="button"
                  size="dialog"
                  className="bg-white text-[#272a2b] hover:bg-white/90"
                  disabled={busyAction !== null}
                  onClick={() => void runAccountAction("sessions")}
                >
                  {busyAction === "sessions" ? "正在撤销 Session…" : "退出全部设备"}
                </Button>
              </div>
            </section>
          </AccountTechnicalCard>

          <AccountTechnicalCard group="manufacture" className="min-h-64">
            <section className="flex h-full flex-col" aria-labelledby={`${fieldId}-delete`}>
              <AccountTechnicalHeading
                icon={<Trash2 className="size-4" aria-hidden="true" />}
                titleId={`${fieldId}-delete`}
              >
                永久注销账号
              </AccountTechnicalHeading>
              <p className="mt-4 text-sm leading-6 text-white/64">
                账号与全部 Session 会立即删除。请输入当前密码确认，此操作不可撤销。
              </p>
              <div className="mt-4 grid gap-1.5">
                <Label className="text-white/72" htmlFor={`${fieldId}-delete-password`}>当前密码</Label>
                <Input
                  id={`${fieldId}-delete-password`}
                  className="border-white/22 bg-white text-[#242424] shadow-none placeholder:text-[#737373]"
                  type="password"
                  value={deletePassword}
                  onChange={(event) => setDeletePassword(event.target.value)}
                  minLength={10}
                  maxLength={128}
                  autoComplete="current-password"
                />
              </div>
              <label className="mt-3 flex min-h-11 items-center gap-3 text-sm text-white/72">
                <input
                  type="checkbox"
                  checked={deleteLocalData}
                  onChange={(event) => setDeleteLocalData(event.target.checked)}
                  className="size-4 shrink-0 accent-white"
                />
                注销成功后同时清除当前浏览器的本地工作区
              </label>
              <div className="mt-auto flex justify-end pt-5">
                <Button
                  type="button"
                  variant="destructive"
                  size="dialog"
                  disabled={deletePassword.length < 10 || busyAction !== null}
                  onClick={() => void runAccountAction("delete")}
                >
                  {busyAction === "delete" ? "正在注销…" : "永久注销账号"}
                </Button>
              </div>
            </section>
          </AccountTechnicalCard>
        </div>
        <CloudDataPanel
          userId={session.user.id}
          workspace={cloudWorkspace}
          onRestorePlan={onRestoreSavedPlan}
          onCloudDataChanged={onCloudDataChanged}
        />
      </div>
    );
  }

  const recoverySteps = [
    { id: "details", label: "确认邮箱" },
    { id: "complete", label: "查收邮件" },
  ];

  return (
    <Card className="surface-shadow overflow-hidden rounded-none ring-0" data-website-account-panel data-auth-wizard>
      <div className="grid lg:grid-cols-[minmax(16rem,0.75fr)_minmax(0,1.25fr)]">
        <div className="border-b border-border/70 px-6 py-7 lg:border-b-0 lg:border-r lg:px-8 lg:py-9">
          <div className="mb-6 grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground">
            <UserRound className="size-5" aria-hidden="true" />
          </div>
          <p className="text-xs font-medium tracking-wide text-primary">账号管理</p>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight">{MODE_COPY[mode].title}</h3>
          <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">{MODE_COPY[mode].description}</p>
        </div>

        <CardContent className={mode === "forgot" ? "grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] p-0" : "p-0"}>
          {mode === "forgot" ? (
            <div className="border-b border-border/70 px-5 pb-4 pt-5 sm:px-8 sm:pb-5 sm:pt-7">
              <WizardSteps
                key={mode}
                steps={recoverySteps}
                value={step}
                onValueChange={(value) => {
                  if (value === "details") setStep("details");
                }}
                label="找回密码步骤"
              />
            </div>
          ) : null}
          {step === "details" ? (
            <form onSubmit={submitDetails} className={`grid grid-rows-[1fr_auto] ${mode === "forgot" ? "h-full min-h-0" : "min-h-full"}`}>
              <div className="grid content-start gap-4 px-5 py-6 sm:px-8 sm:py-8">
                {mode === "signup" ? (
                  <div className="grid gap-1.5">
                    <Label htmlFor={`${fieldId}-name`}>昵称</Label>
                    <Input
                      id={`${fieldId}-name`}
                      className={AUTH_INPUT_CLASS}
                      value={name}
                      onChange={(event) => {
                        setName(event.target.value);
                        if (nameError) setNameError(validateWebsiteAccountName(event.target.value).error);
                      }}
                      required
                      minLength={WEBSITE_ACCOUNT_NAME_MIN_LENGTH}
                      maxLength={WEBSITE_ACCOUNT_NAME_MAX_LENGTH}
                      placeholder="用于网站内显示"
                      autoComplete="name"
                      aria-invalid={Boolean(nameError)}
                      aria-describedby={`${fieldId}-name-hint`}
                    />
                    <p id={`${fieldId}-name-hint`} role={nameError ? "alert" : undefined} className={`text-xs leading-5 ${nameError ? "text-destructive" : "text-muted-foreground"}`}>
                      {nameError ?? WEBSITE_ACCOUNT_NAME_HINT}
                    </p>
                  </div>
                ) : null}
                <div className="grid gap-1.5">
                  <Label htmlFor={`${fieldId}-email`}>邮箱</Label>
                  <Input className={AUTH_INPUT_CLASS} id={`${fieldId}-email`} value={email} onChange={(event) => setEmail(event.target.value)} required type="email" placeholder="name@example.com" autoComplete="email" />
                </div>
                {mode !== "forgot" ? (
                  <div className="grid gap-1.5">
                    <Label htmlFor={`${fieldId}-password`}>密码</Label>
                    <Input className={AUTH_INPUT_CLASS} id={`${fieldId}-password`} value={password} onChange={(event) => setPassword(event.target.value)} required type="password" minLength={10} maxLength={128} placeholder="10–128 位" autoComplete={mode === "signup" ? "new-password" : "current-password"} />
                    {mode === "signup" ? <PasswordStrength value={password} className="mt-1.5" /> : null}
                  </div>
                ) : null}
                {mode === "signup" ? (
                  <p className="text-xs leading-5 text-muted-foreground">
                    注册即表示你已阅读并同意<Link className="underline underline-offset-2" href="/terms">服务条款</Link>和<Link className="underline underline-offset-2" href="/privacy">隐私政策</Link>。
                  </p>
                ) : null}
                {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
                {message ? <p role="status" className="text-sm text-muted-foreground">{message}</p> : null}
              </div>
              <div className="grid gap-3 border-t px-5 py-4 sm:px-8 sm:py-5">
                <Button type="submit" size="dialog" className="w-full" disabled={busy}>
                  {busy ? "正在处理…" : mode === "signup" ? "创建账号并发送验证码" : mode === "forgot" ? "发送重置邮件" : "登录"}
                </Button>
                <div className="flex min-h-11 flex-wrap items-center justify-center gap-x-1 text-xs">
                  <Button type="button" size="sm" variant="ghost" onClick={() => chooseMode(mode === "signup" ? "signin" : "signup")}>{mode === "signup" ? "已有账号" : "创建账号"}</Button>
                  {mode === "forgot" ? (
                    <Button type="button" size="sm" variant="ghost" onClick={() => chooseMode("signin")}><ArrowLeft />返回登录</Button>
                  ) : (
                    <Button type="button" size="sm" variant="ghost" onClick={() => chooseMode("forgot")}>忘记密码</Button>
                  )}
                  {mode === "signin" ? <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void sendVerificationCode()}>验证邮箱</Button> : null}
                </div>
              </div>
            </form>
          ) : step === "verify" ? (
            <form onSubmit={verifyCode} className="grid min-h-full grid-rows-[1fr_auto]">
              <div className="grid content-center gap-5 px-4 py-8 sm:px-8">
                <div className="text-center">
                  <MailCheck className="mx-auto size-8 text-primary" aria-hidden="true" />
                  <h3 className="mt-3 font-semibold">输入邮箱验证码</h3>
                  <p className="mt-1 break-all text-sm text-muted-foreground">已发送至 {email}</p>
                </div>
                <OtpInput
                  ref={otpRef}
                  autoFocus
                  disabled={busy}
                  status={otpStatus}
                  onChange={(value) => {
                    setOtp(value);
                    if (otpStatus === "error") {
                      setOtpStatus("idle");
                      setError(null);
                    }
                  }}
                  hint="输入邮件中的 6 位数字"
                  errorMessage={error ?? "验证码不正确或已失效，请重试。"}
                  successMessage="验证成功"
                />
                {message ? <p role="status" className="text-center text-sm text-muted-foreground">{message}</p> : null}
                {error ? <p role="alert" className="sr-only">{error}</p> : null}
              </div>
              <div className="grid gap-2 border-t px-5 py-4 sm:px-8 sm:py-5">
                <Button type="submit" size="dialog" className="w-full" disabled={busy || otp.length !== 6}>{busy ? "正在验证…" : "验证邮箱"}</Button>
                <div className="flex min-h-11 items-center justify-center gap-2 text-xs">
                  <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { setStep("details"); setOtpStatus("idle"); setError(null); }}><ArrowLeft />修改邮箱</Button>
                  <Button type="button" size="sm" variant="ghost" className="font-number" disabled={busy || resendSeconds > 0} onClick={() => void sendVerificationCode()}>
                    {resendSeconds > 0 ? `${resendSeconds} 秒后重发` : "重新发送验证码"}
                  </Button>
                </div>
              </div>
            </form>
          ) : (
            <div className="grid min-h-80 grid-rows-[1fr_auto]">
              <div className="grid content-center justify-items-center gap-3 px-5 py-10 text-center sm:px-8">
                <CheckCircle2 className="size-10 text-emerald-600" aria-hidden="true" />
                <h3 className="font-semibold">{mode === "forgot" ? "重置邮件已发送" : "邮箱验证完成"}</h3>
                {message ? <p role="status" className="max-w-sm text-sm leading-6 text-muted-foreground">{message}</p> : null}
              </div>
              <div className="border-t px-5 py-4 sm:px-8 sm:py-5">
                <Button type="button" size="dialog" className="w-full" onClick={() => chooseMode("signin")}>返回登录</Button>
              </div>
            </div>
          )}
        </CardContent>
      </div>
    </Card>
  );
}
