"use client";
import { useTranslations, useLocale } from "next-intl";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { AdminSessionData, AdminUserAction, AdminUserData } from "@/types";

const CLIENT_SKLAND_ENABLED = process.env.APP_CLIENT_SKLAND_ENABLED === "1";

type RoleChange = { userId: string; name: string; email: string; action: "grantAdmin" | "revokeAdmin" };

export function AdminUserManagement() {
  const intl = useTranslations();
  const locale = useLocale();
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
      if (!response.ok) throw new Error(body.error?.message ?? (intl("app_admin_users_users_client.couldNotLoadUsers")));
      setUsers(body.data.users);
      setCanManageAdminRoles(body.data.permissions.canManageAdminRoles);
    } finally {
      setLoading(false);
    }
  }, [intl]);

  useEffect(() => {
    void load("").catch((error) => {
      setMessage(error instanceof Error ? error.message : (intl("app_admin_users_users_client.couldNotLoadUsers")));
    });
  }, [intl, load]);

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
      if (!response.ok) throw new Error(body.error?.message ?? (intl("app_admin_users_users_client.actionFailed")));
      setMessage(action === "grantAdmin" ? (intl("app_admin_users_users_client.administratorRoleGranted")) : action === "revokeAdmin" ? (intl("app_admin_users_users_client.administratorRoleRevoked")) : (intl("app_admin_users_users_client.actionCompleted")));
      if (action === "revokeSessions" || action === "ban") {
        setSessionsByUser((current) => ({ ...current, [userId]: [] }));
      }
      await load(query.trim());
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : (intl("app_admin_users_users_client.actionFailed")));
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
      if (!response.ok) throw new Error(body.error?.message ?? (intl("app_admin_users_users_client.couldNotLoadSessions")));
      setSessionsByUser((current) => ({ ...current, [userId]: body.data.sessions }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : (intl("app_admin_users_users_client.couldNotLoadSessions")));
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <section id="users" className="scroll-mt-24 overflow-hidden rounded-2xl border bg-card" data-admin-user-management>
      <header className="border-b px-5 py-5 sm:px-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{intl("app_admin_users_users_client.userManagement")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {intl("app_admin_users_users_client.searchSuspendInspectOrRevokeSessions")}
            {canManageAdminRoles === true ? (intl("app_admin_users_users_client.theBootstrapAdministratorCanAlsoChangeAdministratorRoles")) : canManageAdminRoles === false ? (intl("app_admin_users_users_client.administratorRolesCanBeChangedOnlyByTheBootstrap")) : ""}
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
              setMessage(error instanceof Error ? error.message : (intl("app_admin_users_users_client.couldNotLoadUsers")));
            });
          }}
        >
          <Input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={100} placeholder={intl("app_admin_users_users_client.searchByEmailOrName")} aria-label={intl("app_admin_users_users_client.searchByEmailOrName")} />
          <Button type="submit" disabled={loading} className="sm:min-w-24">{intl("app_admin_users_users_client.search")}</Button>
        </form>

        {message ? <p role="status" className="text-sm text-muted-foreground">{message}</p> : null}
        {loading ? <p role="status" className="text-sm text-muted-foreground">{intl("app_admin_users_users_client.loadingUsers")}</p> : null}

        <div className="grid divide-y rounded-xl border">
          {!loading && users.length === 0 ? <p className="p-5 text-sm text-muted-foreground">{intl("app_admin_users_users_client.noMatchingUsers")}</p> : null}
          {users.map((entry) => {
            const sessions = sessionsByUser[entry.id];
            const actionBusy = busyKey?.startsWith(`${entry.id}:`) ?? false;
            return (
              <article key={entry.id} className="p-4 sm:p-5">
                <div className="flex flex-wrap justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{entry.name}</h3>
                      {entry.isAdmin ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{entry.isBootstrapAdmin ? (intl("app_admin_users_users_client.bootstrapAdmin")) : (intl("app_admin_users_users_client.admin"))}</span> : null}
                      {CLIENT_SKLAND_ENABLED ? (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${entry.sklandActiveBindingCount > 0 ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
                          {entry.sklandActiveBindingCount > 0 ? (intl("app_admin_users_users_client.sklandActive", { sklandActiveBindingCount: entry.sklandActiveBindingCount })) : (intl("app_admin_users_users_client.noActiveSklandAuthorization"))}
                        </span>
                      ) : null}
                      {CLIENT_SKLAND_ENABLED && entry.sklandRenewalDueCount > 0 ? (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950/50 dark:text-amber-300">{intl("app_admin_users_users_client.renewalDue")} · {entry.sklandRenewalDueCount}</span>
                      ) : null}
                    </div>
                    <p className="mt-1 break-all text-sm text-muted-foreground">{entry.email} · {entry.emailVerified ? (intl("app_admin_users_users_client.verified")) : (intl("app_admin_users_users_client.unverified"))}{entry.banned ? (intl("app_admin_users_users_client.suspended")) : ""}</p>
                    {entry.banned && entry.banReason ? <p className="mt-1 text-xs text-destructive">{intl("app_admin_users_users_client.reason")}{entry.banReason}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canManageAdminRoles && !entry.isBootstrapAdmin ? (
                      <Button
                        type="button"
                        size="sm"
                        variant={entry.isAdmin ? "destructive" : "secondary"}
                        disabled={actionBusy || (!entry.isAdmin && (!entry.emailVerified || Boolean(entry.banned)))}
                        title={!entry.isAdmin && (!entry.emailVerified || entry.banned) ? (intl("app_admin_users_users_client.onlyVerifiedActiveAccountsCanBecomeAdministrators")) : undefined}
                        onClick={() => setRoleChange({ userId: entry.id, name: entry.name, email: entry.email, action: entry.isAdmin ? "revokeAdmin" : "grantAdmin" })}
                      >
                        {entry.isAdmin ? (intl("app_admin_users_users_client.revokeAdmin")) : (intl("app_admin_users_users_client.grantAdmin"))}
                      </Button>
                    ) : null}
                    <Button type="button" size="sm" variant="outline" disabled={actionBusy} onClick={() => void toggleSessions(entry.id)}>{sessions ? (intl("app_admin_users_users_client.hideSessions")) : (intl("app_admin_users_users_client.viewSessions"))}</Button>
                    <Button type="button" size="sm" variant="outline" disabled={actionBusy} onClick={() => void act(entry.id, "revokeSessions")}>{intl("app_admin_users_users_client.revokeSessions")}</Button>
                    <Button type="button" size="sm" variant={entry.banned ? "outline" : "destructive"} disabled={actionBusy} onClick={() => void act(entry.id, entry.banned ? "unban" : "ban")}>{entry.banned ? (intl("app_admin_users_users_client.unsuspend")) : (intl("app_admin_users_users_client.suspend"))}</Button>
                  </div>
                </div>
                {sessions ? (
                  <div className="mt-4 grid gap-2 border-t pt-3">
                    {sessions.length ? sessions.map((current) => (
                      <div key={current.id} className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                        <p>{intl("app_admin_users_users_client.created")}{new Date(current.createdAt).toLocaleString((locale === "en" ? "en-US" : "zh-CN"))} · {intl("app_admin_users_users_client.expires")}{new Date(current.expiresAt).toLocaleString((locale === "en" ? "en-US" : "zh-CN"))}</p>
                        <p className="mt-1 break-all">{current.ipAddress ?? (intl("app_admin_users_users_client.unknownIp"))} · {current.userAgent ?? (intl("app_admin_users_users_client.unknownBrowser"))}</p>
                      </div>
                    )) : <p className="text-sm text-muted-foreground">{intl("app_admin_users_users_client.noActiveSessions")}</p>}
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
            <DialogTitle>{roleChange?.action === "revokeAdmin" ? (intl("app_admin_users_users_client.revokeAdministratorRole")) : (intl("app_admin_users_users_client.grantAdministratorRole"))}</DialogTitle>
            <DialogDescription className="break-words">
              {roleChange?.action === "revokeAdmin"
                ? (intl("app_admin_users_users_client.willImmediatelyLoseAccessToUserManagement", { name: roleChange.name, email: roleChange.email }))
                : (intl("app_admin_users_users_client.willBeAbleToSearchAndSuspendUsersAnd", { value1: (en) ? (roleChange?.name ?? "This user") : "", value2: roleChange?.email ?? "", value3: (en) ? "" : (roleChange?.name ?? "该用户") }))}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm text-muted-foreground">{intl("app_admin_users_users_client.thisActionDoesNotChangeTheAccountPasswordOr")}</p>
          </DialogBody>
          <DialogFooter>
            <Button type="button" size="dialog" variant="ghost" disabled={Boolean(busyKey)} onClick={() => setRoleChange(null)}>{intl("app_admin_users_users_client.cancel")}</Button>
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
              {roleChange?.action === "revokeAdmin" ? (intl("app_admin_users_users_client.confirmRevocation")) : (intl("app_admin_users_users_client.confirmAdministrator"))}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
