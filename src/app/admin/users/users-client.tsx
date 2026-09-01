"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { AdminSessionData, AdminUserAction, AdminUserData, SolverPingFingerprint } from "@/types";
import { AdminSolverMetrics } from "./solver-metrics-client";

const CLIENT_SKLAND_ENABLED = process.env.APP_CLIENT_SKLAND_ENABLED === "1";

type RoleChange = { userId: string; name: string; email: string; action: "grantAdmin" | "revokeAdmin" };

function FingerprintValue({ value, dataAttribute }: { value: string | number | null; dataAttribute?: string }) {
  return (
    <code
      className="mt-1 block break-all font-mono text-xs leading-5 text-foreground"
      {...(dataAttribute ? { [dataAttribute]: value ?? "unavailable" } : {})}
    >
      {value ?? "未返回"}
    </code>
  );
}

export function AdminUsers({
  plannerReady,
  solverFingerprint,
}: {
  plannerReady: boolean;
  solverFingerprint: SolverPingFingerprint | null;
}) {
  const [users, setUsers] = useState<AdminUserData[]>([]);
  const [canManageAdminRoles, setCanManageAdminRoles] = useState<boolean | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [roleChange, setRoleChange] = useState<RoleChange | null>(null);
  const [sessionsByUser, setSessionsByUser] = useState<Record<string, AdminSessionData[] | undefined>>({});
  const executableSha256 = solverFingerprint?.solverExecutableSha256 ?? null;

  const load = useCallback(async (search: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/users?q=${encodeURIComponent(search)}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "无法读取用户");
      setUsers(body.data.users);
      setCanManageAdminRoles(body.data.permissions.canManageAdminRoles);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load("").catch((error) => {
      setMessage(error instanceof Error ? error.message : "无法读取用户");
    });
  }, [load]);

  async function act(userId: string, action: AdminUserAction): Promise<boolean> {
    setBusyKey(`${userId}:${action}`);
    setMessage(null);
    try {
      const userPath = `/api/admin/users/${encodeURIComponent(userId)}`;
      const response = action === "revokeSessions"
        ? await fetch(`${userPath}/sessions`, { method: "DELETE" })
        : await fetch(userPath, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(action === "ban" || action === "unban"
              ? { banned: action === "ban" }
              : { isAdmin: action === "grantAdmin" }),
          });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "操作失败");
      setMessage(action === "grantAdmin" ? "已设为管理员。" : action === "revokeAdmin" ? "已取消管理员权限。" : "操作已完成。");
      if (action === "revokeSessions" || action === "ban") {
        setSessionsByUser((current) => ({ ...current, [userId]: [] }));
      }
      await load(query.trim());
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败");
      return false;
    } finally {
      setBusyKey(null);
    }
  }

  async function toggleSessions(userId: string) {
    if (sessionsByUser[userId]) {
      setSessionsByUser((current) => ({ ...current, [userId]: undefined }));
      return;
    }
    setBusyKey(`${userId}:sessions`);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/sessions`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "无法读取 Session");
      setSessionsByUser((current) => ({ ...current, [userId]: body.data.sessions }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法读取 Session");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <main className="mx-auto grid max-w-5xl gap-5 p-5 sm:p-8">
      <header>
        <a href="/" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">返回排班助手</a>
        <h1 className="mt-3 text-2xl font-semibold">用户管理</h1>
        <p className="mt-1 text-sm text-muted-foreground">可搜索、封禁、查看及撤销 Session。{canManageAdminRoles === true ? "初始管理员还可以授予或撤销管理员权限。" : canManageAdminRoles === false ? "管理员权限只能由初始管理员调整。" : ""}</p>
      </header>

      <section className="rounded-xl border p-4" data-admin-solver-status>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-medium">线上求解器</h2>
            <p className="mt-1 text-xs text-muted-foreground">当前 Worker 实际返回的可执行文件指纹</p>
          </div>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${plannerReady ? "bg-emerald-50 text-emerald-700" : "bg-destructive/10 text-destructive"}`}>
            {plannerReady ? "运行中" : "未就绪"}
          </span>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Linux ELF SHA-256</p>
        <code
          className="mt-1 block break-all rounded-lg bg-muted/50 px-3 py-2 font-mono text-xs leading-5"
          data-solver-fingerprint={executableSha256 ?? "unavailable"}
        >
          {executableSha256 ?? "Worker 未返回有效指纹"}
        </code>

        <details className="group mt-3 border-t pt-2" data-solver-fingerprint-details>
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 rounded-lg px-2 text-sm outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <span>
              <span className="block font-medium">完整 Worker 指纹</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">构建身份、协议能力与各版本契约</span>
            </span>
            <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
              <span className="group-open:hidden">展开</span>
              <span className="hidden group-open:inline">收起</span>
              <ChevronDown aria-hidden="true" className="size-4 transition-transform duration-200 group-open:rotate-180" />
            </span>
          </summary>

          <div className="grid gap-5 px-2 pb-2 pt-4">
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">构建身份</h3>
              <dl className="mt-2 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">solver.git_commit</dt>
                  <dd><FingerprintValue value={solverFingerprint?.envelopeSolverGitCommit ?? null} dataAttribute="data-solver-envelope-git-commit" /></dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">solver.built_at</dt>
                  <dd><FingerprintValue value={solverFingerprint?.envelopeSolverBuiltAt ?? null} /></dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">result.solver_git_commit</dt>
                  <dd><FingerprintValue value={solverFingerprint?.solverGitCommit ?? null} dataAttribute="data-solver-git-commit" /></dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">result.solver_built_at</dt>
                  <dd><FingerprintValue value={solverFingerprint?.solverBuiltAt ?? null} /></dd>
                </div>
              </dl>
            </div>

            <div className="border-t pt-4">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">协议能力</h3>
              <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-muted-foreground">pong</dt>
                  <dd className="mt-1 text-sm font-medium">{solverFingerprint ? String(solverFingerprint.pong) : "未返回"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">elapsed_ms</dt>
                  <dd><FingerprintValue value={solverFingerprint?.elapsedMs ?? null} /></dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">protocol_version</dt>
                  <dd><FingerprintValue value={solverFingerprint?.protocolVersion ?? null} /></dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">plan_schema_version</dt>
                  <dd><FingerprintValue value={solverFingerprint?.planSchemaVersion ?? null} /></dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">supported_plan_schema_versions</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {solverFingerprint?.supportedPlanSchemaVersions.length
                  ? solverFingerprint.supportedPlanSchemaVersions.map((version) => (
                    <code key={version} className="rounded-md bg-muted px-2 py-1 font-mono text-xs">v{version}</code>
                  ))
                  : <span className="text-xs text-muted-foreground">未返回</span>}
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">计划契约</h3>
              <p className="mt-2 text-xs text-muted-foreground">plan_contract_sha256</p>
              <FingerprintValue value={solverFingerprint?.planContractSha256 ?? null} dataAttribute="data-plan-contract-sha256" />
              <div className="mt-3 overflow-hidden rounded-lg border">
                {solverFingerprint?.planContractSha256ByVersion.length
                  ? solverFingerprint.planContractSha256ByVersion.map(({ version, sha256 }, index) => (
                    <div
                      key={version}
                      className={`grid grid-cols-[auto_1fr] gap-3 px-3 py-2.5 ${index ? "border-t" : ""}`}
                      data-plan-contract-version={version}
                    >
                      <span className="text-xs font-medium text-muted-foreground">v{version}</span>
                      <code className="min-w-0 break-all text-right font-mono text-xs leading-5">{sha256}</code>
                    </div>
                  ))
                  : <p className="px-3 py-2.5 text-xs text-muted-foreground">Worker 未返回按版本划分的契约指纹。</p>}
              </div>
            </div>
          </div>
        </details>
      </section>

      <AdminSolverMetrics />

      <form
        className="flex gap-2 max-sm:flex-col"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          setMessage(null);
          void load(query.trim()).catch((error) => {
            setMessage(error instanceof Error ? error.message : "无法读取用户");
          });
        }}
      >
        <Input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={100} placeholder="搜索邮箱或昵称" aria-label="搜索邮箱或昵称" />
        <Button type="submit" disabled={loading}>搜索</Button>
      </form>

      {message ? <p role="status" className="text-sm text-muted-foreground">{message}</p> : null}
      {loading ? <p role="status" className="text-sm text-muted-foreground">正在读取用户…</p> : null}

      <div className="grid gap-3">
        {!loading && users.length === 0 ? <p className="rounded-xl border p-4 text-sm text-muted-foreground">没有匹配的用户。</p> : null}
        {users.map((entry) => {
          const sessions = sessionsByUser[entry.id];
          const actionBusy = busyKey?.startsWith(`${entry.id}:`) ?? false;
          return (
            <article key={entry.id} className="rounded-xl border p-4">
              <div className="flex flex-wrap justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-medium">{entry.name}</h2>
                    {entry.isAdmin ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{entry.isBootstrapAdmin ? "初始管理员" : "管理员"}</span> : null}
                    {CLIENT_SKLAND_ENABLED ? (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${entry.sklandActiveBindingCount > 0 ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                        {entry.sklandActiveBindingCount > 0 ? `森空岛有效 · ${entry.sklandActiveBindingCount}` : "森空岛无有效授权"}
                      </span>
                    ) : null}
                    {CLIENT_SKLAND_ENABLED && entry.sklandRenewalDueCount > 0 ? (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                        待续期 · {entry.sklandRenewalDueCount}
                      </span>
                    ) : null}
                  </div>
                  <p className="break-all text-sm text-muted-foreground">{entry.email} · {entry.emailVerified ? "已验证" : "未验证"}{entry.banned ? " · 已封禁" : ""}</p>
                  {entry.banned && entry.banReason ? <p className="mt-1 text-xs text-destructive">原因：{entry.banReason}</p> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {canManageAdminRoles && !entry.isBootstrapAdmin ? (
                    <Button
                      type="button"
                      size="sm"
                      variant={entry.isAdmin ? "destructive" : "secondary"}
                      disabled={actionBusy || (!entry.isAdmin && (!entry.emailVerified || Boolean(entry.banned)))}
                      title={!entry.isAdmin && (!entry.emailVerified || entry.banned) ? "只能将已验证且未封禁的账号设为管理员" : undefined}
                      onClick={() => setRoleChange({ userId: entry.id, name: entry.name, email: entry.email, action: entry.isAdmin ? "revokeAdmin" : "grantAdmin" })}
                    >
                      {entry.isAdmin ? "取消管理员" : "设为管理员"}
                    </Button>
                  ) : null}
                  <Button type="button" size="sm" variant="outline" disabled={actionBusy} onClick={() => void toggleSessions(entry.id)}>{sessions ? "收起 Session" : "查看 Session"}</Button>
                  <Button type="button" size="sm" variant="outline" disabled={actionBusy} onClick={() => void act(entry.id, "revokeSessions")}>撤销 Session</Button>
                  <Button type="button" size="sm" variant={entry.banned ? "outline" : "destructive"} disabled={actionBusy} onClick={() => void act(entry.id, entry.banned ? "unban" : "ban")}>{entry.banned ? "解封" : "封禁"}</Button>
                </div>
              </div>
              {sessions ? (
                <div className="mt-4 grid gap-2 border-t pt-3">
                  {sessions.length ? sessions.map((current) => (
                    <div key={current.id} className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                      <p>创建：{new Date(current.createdAt).toLocaleString("zh-CN")} · 到期：{new Date(current.expiresAt).toLocaleString("zh-CN")}</p>
                      <p className="mt-1 break-all">{current.ipAddress ?? "未知 IP"} · {current.userAgent ?? "未知浏览器"}</p>
                    </div>
                  )) : <p className="text-sm text-muted-foreground">当前没有有效 Session。</p>}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      <Dialog
        open={Boolean(roleChange)}
        onOpenChange={(open) => {
          if (!open && !busyKey) setRoleChange(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{roleChange?.action === "revokeAdmin" ? "取消管理员权限？" : "设为管理员？"}</DialogTitle>
            <DialogDescription className="break-words">
              {roleChange?.action === "revokeAdmin"
                ? `取消后，${roleChange.name}（${roleChange.email}）将立即无法继续访问用户管理功能。`
                : `${roleChange?.name ?? "该用户"}（${roleChange?.email ?? ""}）将可以搜索、封禁用户和撤销 Session，但不能授予其他人管理员权限。`}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm text-muted-foreground">此操作不会更改该账号的密码，也不会删除现有业务数据。</p>
          </DialogBody>
          <DialogFooter>
            <Button type="button" size="dialog" variant="ghost" disabled={Boolean(busyKey)} onClick={() => setRoleChange(null)}>取消</Button>
            <Button
              type="button"
              size="dialog"
              variant={roleChange?.action === "revokeAdmin" ? "destructive" : "default"}
              disabled={!roleChange || Boolean(busyKey)}
              onClick={async () => {
                if (!roleChange) return;
                if (await act(roleChange.userId, roleChange.action)) setRoleChange(null);
              }}
            >
              {roleChange?.action === "revokeAdmin" ? "确认取消" : "确认设为管理员"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
