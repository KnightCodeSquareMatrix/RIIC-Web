"use client";

import { useEffect, useState } from "react";

import { passwordConfirmationError } from "@/components/auth/password-confirmation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const resetToken = new URLSearchParams(location.search).get("token")?.trim() ?? "";
    setToken(resetToken);
    if (!resetToken) setMessage("重置链接无效或缺少令牌，请重新申请密码重置邮件。");
  }, []);

  async function resetPassword() {
    if (!token) {
      setMessage("重置链接无效或缺少令牌，请重新申请密码重置邮件。");
      return;
    }
    const confirmationError = passwordConfirmationError(password, confirmPassword);
    if (confirmationError) {
      setConfirmPasswordError(confirmationError);
      return;
    }
    setConfirmPasswordError(null);
    setBusy(true);
    setMessage(null);
    const result = await authClient.resetPassword({ newPassword: password, token });
    setMessage(result.error?.message ?? "密码已重置，旧 Session 已撤销，请返回首页登录。");
    setBusy(false);
  }

  return (
    <main className="mx-auto grid min-h-dvh max-w-md place-content-center gap-4 p-5">
      <a href="/" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">返回排班助手</a>
      <h1 className="text-2xl font-semibold">重置密码</h1>
      <p className="text-sm leading-6 text-muted-foreground">新密码需为 10–128 位。重置成功后，其他登录设备上的 Session 也会失效。</p>
      <div className="grid gap-1.5">
        <Label htmlFor="reset-password">新密码</Label>
        <Input
          id="reset-password"
          type="password"
          minLength={10}
          maxLength={128}
          value={password}
          onChange={(event) => {
            const nextPassword = event.target.value;
            setPassword(nextPassword);
            if (confirmPasswordError) {
              setConfirmPasswordError(passwordConfirmationError(nextPassword, confirmPassword));
            }
          }}
          autoComplete="new-password"
          placeholder="新密码（10–128 位）"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="reset-confirm-password">确认新密码</Label>
        <Input
          id="reset-confirm-password"
          type="password"
          minLength={10}
          maxLength={128}
          value={confirmPassword}
          onChange={(event) => {
            const nextConfirmation = event.target.value;
            setConfirmPassword(nextConfirmation);
            if (confirmPasswordError) {
              setConfirmPasswordError(passwordConfirmationError(password, nextConfirmation));
            }
          }}
          onBlur={() => setConfirmPasswordError(passwordConfirmationError(password, confirmPassword))}
          autoComplete="new-password"
          placeholder="再次输入新密码"
          aria-invalid={Boolean(confirmPasswordError)}
          aria-describedby="reset-confirm-password-hint"
        />
        <p
          id="reset-confirm-password-hint"
          role={confirmPasswordError ? "alert" : undefined}
          className={`text-xs leading-5 ${confirmPasswordError ? "text-destructive" : "text-muted-foreground"}`}
        >
          {confirmPasswordError ?? "请再次输入上面的新密码。"}
        </p>
      </div>
      <Button
        type="button"
        disabled={busy || !token || password.length < 10 || confirmPassword.length < 10}
        onClick={() => void resetPassword()}
      >
        {busy ? "正在重置…" : "确认重置"}
      </Button>
      {message ? <p role="status" className="text-sm text-muted-foreground">{message}</p> : null}
    </main>
  );
}
