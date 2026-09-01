"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { AdminSessionData, AdminUserAction, AdminUserData } from "@/types";

const CLIENT_SKLAND_ENABLED = process.env.APP_CLIENT_SKLAND_ENABLED === "1";

type RoleChange = { userId: string; name: string; email: string; action: "grantAdmin" | "revokeAdmin" };

export function AdminUserManagement() {
  const [users, setUsers] = useState<AdminUserData[]>([]);
  const [canManageAdminRoles, setCanManageAdminRoles] = useState<boolean | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [roleChange, setRoleChange] = useState<RoleChange | null>(null);
  const [sessionsByUser, setSessionsByUser] = useState<Record<string, AdminSessionData[] | undefined>>({});

  const load = useCallback(async (search: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/users?q=${encodeURIComponent(search)}`, { cache: "no-store" });
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
      const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/sessions`, { cache: "no-store" });
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
    <section id="users" className="scroll-mt-24 overflow-hidden rounded-2xl border bg-card" data-admin-user-management>
      <header className="border-b px-5 py-5 sm:px-6">
        <div className="flex gap-3">
          <span className="pt-0.5 font-mono text-xs text-muted-foreground" aria-hidden="true">03</span>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">用户管理</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              搜索、封禁、查看或撤销 Session。
              {canManageAdminRoles === true ? " 初始管理员还可以调整管理员权限。" : canManageAdminRoles === false ? " 管理员权限只能由初始管理员调整。" : ""}
            </p>
          </div>
        </div>
      </header>

      <div className="grid gap-5 px-5 py-5 sm:px-6">
        <form
          className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
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
          <Button type="submit" disabled={loading} className="sm:min-w-24">搜索</Button>
        </form>

        {message ? <p role="status" className="text-sm text-muted-foreground">{message}</p> : null}
        {loading ? <p role="status" className="text-sm text-muted-foreground">正在读取用户…</p> : null}

        <div className="grid divide-y rounded-xl border">
          {!loading && users.length === 0 ? <p className="p-5 text-sm text-muted-foreground">没有匹配的用户。</p> : null}
          {users.map((entry) => {
            const sessions = sessionsByUser[entry.id];
            const actionBusy = busyKey?.startsWith(`${entry.id}:`) ?? false;
            return (
              <article key={entry.id} className="p-4 sm:p-5">
                <div className="flex flex-wrap justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{entry.name}</h3>
                      {entry.isAdmin ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{entry.isBootstrapAdmin ? "初始管理员" : "管理员"}</span> : null}
                      {CLIENT_SKLAND_ENABLED ? (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${entry.sklandActiveBindingCount > 0 ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
                          {entry.sklandActiveBindingCount > 0 ? `森空岛有效 · ${entry.sklandActiveBindingCount}` : "森空岛无有效授权"}
                        </span>
                      ) : null}
                      {CLIENT_SKLAND_ENABLED && entry.sklandRenewalDueCount > 0 ? (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950/50 dark:text-amber-300">待续期 · {entry.sklandRenewalDueCount}</span>
                      ) : null}
                    </div>
                    <p className="mt-1 break-all text-sm text-muted-foreground">{entry.email} · {entry.emailVerified ? "已验证" : "未验证"}{entry.banned ? " · 已封禁" : ""}</p>
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
    </section>
  );
}
