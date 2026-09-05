"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { AdminSessionData, AdminUserAction, AdminUserData } from "@/types";
import { useLanguageDemo } from "@/language-demo";

const CLIENT_SKLAND_ENABLED = process.env.APP_CLIENT_SKLAND_ENABLED === "1";

type RoleChange = { userId: string; name: string; email: string; action: "grantAdmin" | "revokeAdmin" };

export function AdminUserManagement() {
  const { locale } = useLanguageDemo();
  const en = locale === "en";
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
      if (!response.ok) throw new Error(body.error?.message ?? (en ? "Could not load users" : "无法读取用户"));
      setUsers(body.data.users);
      setCanManageAdminRoles(body.data.permissions.canManageAdminRoles);
    } finally {
      setLoading(false);
    }
  }, [en]);

  useEffect(() => {
    void load("").catch((error) => {
      setMessage(error instanceof Error ? error.message : (en ? "Could not load users" : "无法读取用户"));
    });
  }, [en, load]);

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
      if (!response.ok) throw new Error(body.error?.message ?? (en ? "Action failed" : "操作失败"));
      setMessage(action === "grantAdmin" ? (en ? "Administrator role granted." : "已设为管理员。") : action === "revokeAdmin" ? (en ? "Administrator role revoked." : "已取消管理员权限。") : (en ? "Action completed." : "操作已完成。"));
      if (action === "revokeSessions" || action === "ban") {
        setSessionsByUser((current) => ({ ...current, [userId]: [] }));
      }
      await load(query.trim());
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : (en ? "Action failed" : "操作失败"));
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
      if (!response.ok) throw new Error(body.error?.message ?? (en ? "Could not load sessions" : "无法读取 Session"));
      setSessionsByUser((current) => ({ ...current, [userId]: body.data.sessions }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : (en ? "Could not load sessions" : "无法读取 Session"));
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <section id="users" className="scroll-mt-24 overflow-hidden rounded-2xl border bg-card" data-admin-user-management>
      <header className="border-b px-5 py-5 sm:px-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{en ? "User management" : "用户管理"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {en ? "Search, suspend, inspect, or revoke sessions." : "搜索、封禁、查看或撤销 Session。"}
            {canManageAdminRoles === true ? (en ? " The bootstrap administrator can also change administrator roles." : " 初始管理员还可以调整管理员权限。") : canManageAdminRoles === false ? (en ? " Administrator roles can be changed only by the bootstrap administrator." : " 管理员权限只能由初始管理员调整。") : ""}
          </p>
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
              setMessage(error instanceof Error ? error.message : (en ? "Could not load users" : "无法读取用户"));
            });
          }}
        >
          <Input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={100} placeholder={en ? "Search by email or name" : "搜索邮箱或昵称"} aria-label={en ? "Search by email or name" : "搜索邮箱或昵称"} />
          <Button type="submit" disabled={loading} className="sm:min-w-24">{en ? "Search" : "搜索"}</Button>
        </form>

        {message ? <p role="status" className="text-sm text-muted-foreground">{message}</p> : null}
        {loading ? <p role="status" className="text-sm text-muted-foreground">{en ? "Loading users…" : "正在读取用户…"}</p> : null}

        <div className="grid divide-y rounded-xl border">
          {!loading && users.length === 0 ? <p className="p-5 text-sm text-muted-foreground">{en ? "No matching users." : "没有匹配的用户。"}</p> : null}
          {users.map((entry) => {
            const sessions = sessionsByUser[entry.id];
            const actionBusy = busyKey?.startsWith(`${entry.id}:`) ?? false;
            return (
              <article key={entry.id} className="p-4 sm:p-5">
                <div className="flex flex-wrap justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{entry.name}</h3>
                      {entry.isAdmin ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{entry.isBootstrapAdmin ? (en ? "Bootstrap admin" : "初始管理员") : (en ? "Admin" : "管理员")}</span> : null}
                      {CLIENT_SKLAND_ENABLED ? (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${entry.sklandActiveBindingCount > 0 ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
                          {entry.sklandActiveBindingCount > 0 ? (en ? `Skland active · ${entry.sklandActiveBindingCount}` : `森空岛有效 · ${entry.sklandActiveBindingCount}`) : (en ? "No active Skland authorization" : "森空岛无有效授权")}
                        </span>
                      ) : null}
                      {CLIENT_SKLAND_ENABLED && entry.sklandRenewalDueCount > 0 ? (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950/50 dark:text-amber-300">{en ? "Renewal due" : "待续期"} · {entry.sklandRenewalDueCount}</span>
                      ) : null}
                    </div>
                    <p className="mt-1 break-all text-sm text-muted-foreground">{entry.email} · {entry.emailVerified ? (en ? "Verified" : "已验证") : (en ? "Unverified" : "未验证")}{entry.banned ? (en ? " · Suspended" : " · 已封禁") : ""}</p>
                    {entry.banned && entry.banReason ? <p className="mt-1 text-xs text-destructive">{en ? "Reason: " : "原因："}{entry.banReason}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canManageAdminRoles && !entry.isBootstrapAdmin ? (
                      <Button
                        type="button"
                        size="sm"
                        variant={entry.isAdmin ? "destructive" : "secondary"}
                        disabled={actionBusy || (!entry.isAdmin && (!entry.emailVerified || Boolean(entry.banned)))}
                        title={!entry.isAdmin && (!entry.emailVerified || entry.banned) ? (en ? "Only verified, active accounts can become administrators" : "只能将已验证且未封禁的账号设为管理员") : undefined}
                        onClick={() => setRoleChange({ userId: entry.id, name: entry.name, email: entry.email, action: entry.isAdmin ? "revokeAdmin" : "grantAdmin" })}
                      >
                        {entry.isAdmin ? (en ? "Revoke admin" : "取消管理员") : (en ? "Grant admin" : "设为管理员")}
                      </Button>
                    ) : null}
                    <Button type="button" size="sm" variant="outline" disabled={actionBusy} onClick={() => void toggleSessions(entry.id)}>{sessions ? (en ? "Hide sessions" : "收起 Session") : (en ? "View sessions" : "查看 Session")}</Button>
                    <Button type="button" size="sm" variant="outline" disabled={actionBusy} onClick={() => void act(entry.id, "revokeSessions")}>{en ? "Revoke sessions" : "撤销 Session"}</Button>
                    <Button type="button" size="sm" variant={entry.banned ? "outline" : "destructive"} disabled={actionBusy} onClick={() => void act(entry.id, entry.banned ? "unban" : "ban")}>{entry.banned ? (en ? "Unsuspend" : "解封") : (en ? "Suspend" : "封禁")}</Button>
                  </div>
                </div>
                {sessions ? (
                  <div className="mt-4 grid gap-2 border-t pt-3">
                    {sessions.length ? sessions.map((current) => (
                      <div key={current.id} className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                        <p>{en ? "Created: " : "创建："}{new Date(current.createdAt).toLocaleString(en ? "en-US" : "zh-CN")} · {en ? "Expires: " : "到期："}{new Date(current.expiresAt).toLocaleString(en ? "en-US" : "zh-CN")}</p>
                        <p className="mt-1 break-all">{current.ipAddress ?? (en ? "Unknown IP" : "未知 IP")} · {current.userAgent ?? (en ? "Unknown browser" : "未知浏览器")}</p>
                      </div>
                    )) : <p className="text-sm text-muted-foreground">{en ? "No active sessions." : "当前没有有效 Session。"}</p>}
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
            <DialogTitle>{roleChange?.action === "revokeAdmin" ? (en ? "Revoke administrator role?" : "取消管理员权限？") : (en ? "Grant administrator role?" : "设为管理员？")}</DialogTitle>
            <DialogDescription className="break-words">
              {roleChange?.action === "revokeAdmin"
                ? (en ? `${roleChange.name} (${roleChange.email}) will immediately lose access to user management.` : `取消后，${roleChange.name}（${roleChange.email}）将立即无法继续访问用户管理功能。`)
                : (en ? `${roleChange?.name ?? "This user"} (${roleChange?.email ?? ""}) will be able to search and suspend users and revoke sessions, but cannot grant administrator roles.` : `${roleChange?.name ?? "该用户"}（${roleChange?.email ?? ""}）将可以搜索、封禁用户和撤销 Session，但不能授予其他人管理员权限。`)}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm text-muted-foreground">{en ? "This action does not change the account password or delete existing business data." : "此操作不会更改该账号的密码，也不会删除现有业务数据。"}</p>
          </DialogBody>
          <DialogFooter>
            <Button type="button" size="dialog" variant="ghost" disabled={Boolean(busyKey)} onClick={() => setRoleChange(null)}>{en ? "Cancel" : "取消"}</Button>
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
              {roleChange?.action === "revokeAdmin" ? (en ? "Confirm revocation" : "确认取消") : (en ? "Confirm administrator" : "确认设为管理员")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
