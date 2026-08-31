"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  Check,
  Clipboard,
  KeyRound,
  LoaderCircle,
  ScanLine,
  TriangleAlert,
} from "lucide-react";

import { importSklandCredential, toDisplayError } from "@/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  currentSklandPolicyConsent,
  SklandPolicyConsent,
} from "@/skland-policy-consent";
import type { SklandSessionData } from "@/types";

const SKLAND_CREDENTIAL_COPY_COMMAND = 'copy([localStorage.getItem("SK_OAUTH_CRED_KEY"), localStorage.getItem("SK_TOKEN_CACHE_KEY")].join(","))';

export function SklandCredentialPanel({
  dialogPresentation,
  onAuthenticated,
}: {
  dialogPresentation: boolean;
  onAuthenticated: (session: SklandSessionData) => void;
}) {
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [credential, setCredential] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const credentialInputId = useId();
  const mountedRef = useRef(true);
  const consentReady = termsAccepted && privacyAccepted;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
    if (!consentReady || !credential.trim() || submitting) return;
    setSubmitting(true);
    setImportError(null);
    try {
      const session = await importSklandCredential(credential, currentSklandPolicyConsent());
      if (!mountedRef.current) return;
      setCredential("");
      onAuthenticated(session);
    } catch (error) {
      if (!mountedRef.current) return;
      const detail = toDisplayError(error, "凭证导入失败，请稍后重试。");
      setImportError(`${detail.message}（${detail.code}${detail.requestId ? ` · ${detail.requestId}` : ""}）`);
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  }

  return (
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

      <SklandPolicyConsent
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
        disabled={!consentReady || !credential.trim() || submitting}
        data-skland-credential-submit
      >
        {submitting ? <LoaderCircle className="animate-spin motion-reduce:animate-none" /> : <KeyRound />}
        {submitting ? "正在验证凭证…" : "导入并登录"}
      </Button>
    </form>
  );
}
