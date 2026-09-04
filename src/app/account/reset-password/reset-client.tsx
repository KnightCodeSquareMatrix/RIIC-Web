"use client";

import { useEffect, useMemo, useState } from "react";

import { passwordConfirmationError } from "@/components/auth/password-confirmation";
import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { evaluatePasswordStrength, isStrongPassword, PASSWORD_STRENGTH_ERROR } from "@/password-strength";
import { LanguageDemoSwitch, useLanguageDemo } from "@/language-demo";

const PASSWORD_STRENGTH_LABELS = ["尚未输入", "较弱", "一般", "良好", "强"] as const;
const EN_PASSWORD_STRENGTH_LABELS = ["Not entered", "Weak", "Fair", "Good", "Strong"] as const;

function ResetPasswordStrength({ value, id }: { value: string; id: string }) {
  const { locale } = useLanguageDemo();
  const en = locale === "en";
  const strength = useMemo(() => evaluatePasswordStrength(value), [value]);
  const labels = en ? EN_PASSWORD_STRENGTH_LABELS : PASSWORD_STRENGTH_LABELS;
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
        aria-label={en ? "Password strength" : "密码强度"}
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={strength.score}
        aria-valuetext={labels[strength.score]}
        className="grid grid-cols-4 gap-1.5"
      >
        {strength.rules.map((rule, index) => (
          <span key={rule.id} className={`h-1.5 rounded-sm ${index < strength.score ? tone : "bg-muted"}`} />
        ))}
      </div>
      <p aria-live="polite" className="mt-2 text-xs text-muted-foreground">
        {en ? `Password strength: ${labels[strength.score]}.` : `密码强度：${labels[strength.score]}。`}{strength.guessable ? (en ? " Avoid common, easy-to-guess patterns." : "请避免容易猜测的常见模式。") : ""}
      </p>
      <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        {strength.rules.map((rule) => (
          <li key={rule.id} className={`text-xs ${rule.met ? "text-foreground" : "text-muted-foreground"}`}>
            {rule.met ? "✓" : "○"} {en ? ({ length: "At least 10 characters", letter: "Contains a letter", digit: "Contains a number", variety: "Mixed case or a symbol" }[rule.id] ?? rule.label) : rule.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ResetPassword() {
  const { locale } = useLanguageDemo();
  const en = locale === "en";
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
    if (!resetToken) setMessage(en ? "The reset link is invalid or missing a token. Request a new password-reset email." : "重置链接无效或缺少令牌，请重新申请密码重置邮件。");
  }, [en]);

  async function resetPassword() {
    if (!token) {
      setMessage(en ? "The reset link is invalid or missing a token. Request a new password-reset email." : "重置链接无效或缺少令牌，请重新申请密码重置邮件。");
      return;
    }
    if (!isStrongPassword(password)) {
      setPasswordStrengthError(en ? "Password is too weak. Meet every strength rule and avoid common passwords, sequences, or repeated characters." : PASSWORD_STRENGTH_ERROR);
      return;
    }
    setPasswordStrengthError(null);
    const confirmationError = passwordConfirmationError(password, confirmPassword);
    if (confirmationError) {
      setConfirmPasswordError(en ? (confirmPassword ? "The passwords do not match." : "Enter the password again.") : confirmationError);
      return;
    }
    setConfirmPasswordError(null);
    setBusy(true);
    setMessage(null);
    const result = await authClient.resetPassword({ newPassword: password, token });
    setMessage(result.error?.message ?? (en ? "Password reset. Existing sessions have been revoked; return to the home page to sign in." : "密码已重置，旧 Session 已撤销，请返回首页登录。"));
    setBusy(false);
  }

  return (
    <main className="mx-auto grid min-h-dvh max-w-md place-content-center gap-4 p-5">
      <div className="flex items-center justify-between gap-4"><a href="/" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">{en ? "Back to scheduler" : "返回排班助手"}</a><LanguageDemoSwitch /></div>
      <h1 className="text-2xl font-semibold">{en ? "Reset password" : "重置密码"}</h1>
      <p className="text-sm leading-6 text-muted-foreground">{en ? "The new password must contain 10–128 characters and satisfy every rule below. Resetting it also revokes sessions on other devices." : "新密码需为 10–128 位，并满足下方全部强度规则。重置成功后，其他登录设备上的 Session 也会失效。"}</p>
      <div className="grid gap-1.5">
        <Label htmlFor="reset-password">{en ? "New password" : "新密码"}</Label>
        <PasswordInput
          id="reset-password"
          minLength={10}
          maxLength={128}
          value={password}
          onChange={(event) => {
            const nextPassword = event.target.value;
            setPassword(nextPassword);
            if (passwordStrengthError) {
              setPasswordStrengthError(isStrongPassword(nextPassword) ? null : (en ? "Password is too weak. Meet every strength rule and avoid common passwords, sequences, or repeated characters." : PASSWORD_STRENGTH_ERROR));
            }
            if (confirmPasswordError) {
              const error = passwordConfirmationError(nextPassword, confirmPassword);
              setConfirmPasswordError(en && error ? (confirmPassword ? "The passwords do not match." : "Enter the password again.") : error);
            }
          }}
          onBlur={() => {
            if (password && !isStrongPassword(password)) {
              setPasswordStrengthError(en ? "Password is too weak. Meet every strength rule and avoid common passwords, sequences, or repeated characters." : PASSWORD_STRENGTH_ERROR);
            }
          }}
          autoComplete="new-password"
          placeholder={en ? "New password (10–128 characters)" : "新密码（10–128 位）"}
          revealLabel={en ? "Show new password" : "显示新密码"}
          aria-invalid={Boolean(passwordStrengthError)}
          aria-describedby="reset-password-strength"
        />
        <ResetPasswordStrength id="reset-password-strength" value={password} />
        {passwordStrengthError ? (
          <p role="alert" className="text-xs leading-5 text-destructive">{passwordStrengthError}</p>
        ) : null}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="reset-confirm-password">{en ? "Confirm new password" : "确认新密码"}</Label>
        <PasswordInput
          id="reset-confirm-password"
          minLength={10}
          maxLength={128}
          value={confirmPassword}
          onChange={(event) => {
            const nextConfirmation = event.target.value;
            setConfirmPassword(nextConfirmation);
            if (confirmPasswordError) {
              const error = passwordConfirmationError(password, nextConfirmation);
              setConfirmPasswordError(en && error ? (nextConfirmation ? "The passwords do not match." : "Enter the password again.") : error);
            }
          }}
          onBlur={() => {
            const error = passwordConfirmationError(password, confirmPassword);
            setConfirmPasswordError(en && error ? (confirmPassword ? "The passwords do not match." : "Enter the password again.") : error);
          }}
          autoComplete="new-password"
          placeholder={en ? "Enter the new password again" : "再次输入新密码"}
          revealLabel={en ? "Show password confirmation" : "显示确认新密码"}
          aria-invalid={Boolean(confirmPasswordError)}
          aria-describedby="reset-confirm-password-hint"
        />
        <p
          id="reset-confirm-password-hint"
          role={confirmPasswordError ? "alert" : undefined}
          className={`text-xs leading-5 ${confirmPasswordError ? "text-destructive" : "text-muted-foreground"}`}
        >
          {confirmPasswordError ?? (en ? "Enter the new password again." : "请再次输入上面的新密码。")}
        </p>
      </div>
      <Button
        type="button"
        disabled={busy || !token || password.length < 10 || confirmPassword.length < 10}
        onClick={() => void resetPassword()}
      >
        {busy ? (en ? "Resetting…" : "正在重置…") : (en ? "Reset password" : "确认重置")}
      </Button>
      {message ? <p role="status" className="text-sm text-muted-foreground">{message}</p> : null}
    </main>
  );
}
