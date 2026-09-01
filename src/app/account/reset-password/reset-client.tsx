"use client";

import { useEffect, useMemo, useState } from "react";

import { passwordConfirmationError } from "@/components/auth/password-confirmation";
import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { evaluatePasswordStrength, isStrongPassword, PASSWORD_STRENGTH_ERROR } from "@/password-strength";

const PASSWORD_STRENGTH_LABELS = ["尚未输入", "较弱", "一般", "良好", "强"] as const;

function ResetPasswordStrength({ value, id }: { value: string; id: string }) {
  const strength = useMemo(() => evaluatePasswordStrength(value), [value]);
  const tone = strength.score === 0
    ? "bg-muted-foreground/25"
    : strength.score <= 1
      ? "bg-destructive"
      : strength.score <= 2
        ? "bg-amber-500"
        : "bg-emerald-500";

  return (
    <div id={id} className="mt-1.5 w-full" data-password-strength>
      <div
        role="meter"
        aria-label="密码强度"
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={strength.score}
        aria-valuetext={PASSWORD_STRENGTH_LABELS[strength.score]}
        className="grid grid-cols-4 gap-1.5"
      >
        {strength.rules.map((rule, index) => (
          <span key={rule.id} className={`h-1.5 rounded-sm ${index < strength.score ? tone : "bg-muted"}`} />
        ))}
      </div>
      <p aria-live="polite" className="mt-2 text-xs text-muted-foreground">
        密码强度：{PASSWORD_STRENGTH_LABELS[strength.score]}。{strength.guessable ? "请避免容易猜测的常见模式。" : ""}
      </p>
      <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        {strength.rules.map((rule) => (
          <li key={rule.id} className={`text-xs ${rule.met ? "text-foreground" : "text-muted-foreground"}`}>
            {rule.met ? "✓" : "○"} {rule.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ResetPassword() {
  const [password, setPassword] = useState("");
  const [passwordStrengthError, setPasswordStrengthError] = useState<string | null>(null);
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
    if (!isStrongPassword(password)) {
      setPasswordStrengthError(PASSWORD_STRENGTH_ERROR);
      return;
    }
    setPasswordStrengthError(null);
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
      <p className="text-sm leading-6 text-muted-foreground">新密码需为 10–128 位，并满足下方全部强度规则。重置成功后，其他登录设备上的 Session 也会失效。</p>
      <div className="grid gap-1.5">
        <Label htmlFor="reset-password">新密码</Label>
        <PasswordInput
          id="reset-password"
          minLength={10}
          maxLength={128}
          value={password}
          onChange={(event) => {
            const nextPassword = event.target.value;
            setPassword(nextPassword);
            if (passwordStrengthError) {
              setPasswordStrengthError(isStrongPassword(nextPassword) ? null : PASSWORD_STRENGTH_ERROR);
            }
            if (confirmPasswordError) {
              setConfirmPasswordError(passwordConfirmationError(nextPassword, confirmPassword));
            }
          }}
          onBlur={() => {
            if (password && !isStrongPassword(password)) {
              setPasswordStrengthError(PASSWORD_STRENGTH_ERROR);
            }
          }}
          autoComplete="new-password"
          placeholder="新密码（10–128 位）"
          revealLabel="显示新密码"
          aria-invalid={Boolean(passwordStrengthError)}
          aria-describedby="reset-password-strength"
        />
        <ResetPasswordStrength id="reset-password-strength" value={password} />
        {passwordStrengthError ? (
          <p role="alert" className="text-xs leading-5 text-destructive">{passwordStrengthError}</p>
        ) : null}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="reset-confirm-password">确认新密码</Label>
        <PasswordInput
          id="reset-confirm-password"
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
          revealLabel="显示确认新密码"
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
