"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

export function ResetPassword() {
  const [password, setPassword] = useState("");
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
      <Input
        type="password"
        minLength={10}
        maxLength={128}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoComplete="new-password"
        placeholder="新密码（10–128 位）"
        aria-label="新密码"
      />
      <Button type="button" disabled={busy || !token || password.length < 10} onClick={() => void resetPassword()}>
        {busy ? "正在重置…" : "确认重置"}
      </Button>
      {message ? <p role="status" className="text-sm text-muted-foreground">{message}</p> : null}
    </main>
  );
}
