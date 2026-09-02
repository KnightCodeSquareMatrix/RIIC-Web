"use client";

import { Cloud } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import {
  deleteAccountSavedPlan,
  getAccountDataConsent,
  getAccountSavedPlans,
  revokeAccountDataConsent,
  updateAccountSavedPlan,
} from "@/api";
import { cloudSyncMetadataKey } from "@/cloud-sync";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { HoldToConfirm } from "@/components/ui/hold-to-confirm";
import { InfraTechnicalCard, InfraTechnicalHeading } from "@/components/InfraTechnicalCard";
import { useLanguageDemo } from "@/language-demo";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/legal-policy";
import type { AccountDataConsentData, CloudWorkspaceData, SavedPlanData } from "@/types";

const CLOUD_PRIMARY_BUTTON_CLASS = "w-full bg-white text-[#272a2b] hover:bg-white/90 sm:w-auto";
const CLOUD_PLAN_BUTTON_CLASS = "min-h-11 px-3 text-white/78 hover:bg-white/10 hover:text-white";

function formatDate(value: string | null, en: boolean): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(en ? "en-US" : "zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date)
    : "—";
}

export function CloudDataPanel({
  userId,
  workspace,
  onRestorePlan,
  onCloudDataChanged,
}: {
  userId: string;
  workspace?: CloudWorkspaceData | null;
  onRestorePlan?: (plan: SavedPlanData) => void;
  onCloudDataChanged?: () => void;
}) {
  const { locale } = useLanguageDemo();
  const en = locale === "en";
  const [consent, setConsent] = useState<AccountDataConsentData | null>(null);
  const [plans, setPlans] = useState<SavedPlanData[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleteAnnouncement, setDeleteAnnouncement] = useState("");
  const busyRef = useRef<string | null>(null);
  const panelId = useId();

  const reload = useCallback(async () => {
    const next = await getAccountDataConsent();
    setConsent(next);
    setPlans(next.current ? (await getAccountSavedPlans()).plans : []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void reload().catch((cause) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : (en ? "Failed to load cloud data status." : "云端数据状态加载失败。"));
    });
    return () => { cancelled = true; };
  }, [en, reload, workspace?.revision]);

  useEffect(() => {
    if (!pendingDeleteId || busy === `delete:${pendingDeleteId}`) return;
    const timeout = window.setTimeout(() => {
      setPendingDeleteId(null);
      setDeleteAnnouncement(en ? "Delete confirmation timed out. The plan was not deleted." : "删除确认已超时，未删除排班。");
    }, 8_000);
    return () => window.clearTimeout(timeout);
  }, [busy, en, pendingDeleteId]);

  if (consent && !consent.cloudSyncEnabled) return null;

  async function run(key: string, action: () => Promise<void>): Promise<boolean> {
    if (busyRef.current) return false;
    busyRef.current = key;
    setBusy(key);
    setError(null);
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : (en ? "Cloud data operation failed." : "云端数据操作失败。")); }
    finally {
      busyRef.current = null;
      setBusy(null);
    }
    return true;
  }

  function reopenConsent() {
    window.localStorage.removeItem(`cloud-consent-dismissed:${userId}:${TERMS_VERSION}:${PRIVACY_VERSION}`);
    onCloudDataChanged?.();
  }

  return (
    <InfraTechnicalCard group="control" className="min-h-64" dataSlot="cloud-workspace-card">
      <section className="flex h-full flex-col" aria-labelledby={`${panelId}-title`} data-cloud-data-panel>
        <InfraTechnicalHeading
          icon={<Cloud className="size-4" aria-hidden="true" />}
          titleId={`${panelId}-title`}
        >
          {en ? "Account cloud workspace" : "账号云端工作区"}
        </InfraTechnicalHeading>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-white/64">
          {consent?.current
            ? (en ? `Synced · Last sync ${formatDate(workspace?.syncedAt ?? null, true)}` : `已同步 · 最近同步 ${formatDate(workspace?.syncedAt ?? null, false)}`)
            : (en ? "Local-only mode is active. Existing data is not uploaded." : "当前保持纯本地模式，不会上传已有数据。")}
        </p>
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true" data-cloud-delete-status>{deleteAnnouncement}</p>
        <div className="mt-5 grid gap-5">
          {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
          {!consent?.current ? (
            <div className="flex flex-col items-start gap-4 border-t border-white/14 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm leading-6 text-white/64">{en ? "Automatic sync starts only after you accept the current policies." : "确认新版政策后才会开始自动同步。"}</p>
              <Button type="button" size="dialog" className={CLOUD_PRIMARY_BUTTON_CLASS} onClick={reopenConsent}>{en ? "Review sync details" : "查看同步说明"}</Button>
            </div>
          ) : (
            <>
            <section className="grid gap-3" aria-labelledby={`${panelId}-plans-title`}>
              <h3 id={`${panelId}-plans-title`} className="text-xs font-medium tracking-wide text-white/66">{en ? "Schedule history" : "排班历史"}</h3>
              {plans.length ? plans.map((plan) => (
                <div key={plan.id} className="grid gap-3 border border-white/16 bg-black/12 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{plan.title}</p>
                    <p className="font-number mt-1 text-xs leading-5 text-white/64">
                      <time dateTime={plan.updatedAt}>{formatDate(plan.updatedAt, en)}</time>
                    </p>
                    {!plan.calculationContext ? (
                      <p className="mt-1 text-xs leading-5 text-white/64">{en ? "Calculation settings are missing; this plan cannot be restored" : "缺少计算配置，无法恢复"}</p>
                    ) : !plan.boxMatchesWorkspace ? (
                      <p className="mt-1 text-xs leading-5 text-white/64">{en ? "MAA BOX does not match; this plan cannot be restored" : "MAA Box 不一致，无法恢复"}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-1.5 max-sm:justify-start">
                    {pendingDeleteId === plan.id ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className={CLOUD_PLAN_BUTTON_CLASS}
                          disabled={busy !== null}
                          aria-label={en ? `Cancel deleting plan: ${plan.title}` : `取消删除排班：${plan.title}`}
                          onClick={() => {
                            setPendingDeleteId(null);
                            setDeleteAnnouncement(en ? `Cancelled deleting plan: ${plan.title}.` : `已取消删除排班：${plan.title}。`);
                          }}
                        >
                          {en ? "Cancel" : "取消"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          className="min-h-11 px-3"
                          disabled={busy !== null}
                          aria-label={en ? `Confirm deleting plan: ${plan.title}` : `确认删除排班：${plan.title}`}
                          onClick={() => void (async () => {
                            const started = await run(`delete:${plan.id}`, async () => {
                              await deleteAccountSavedPlan(plan.id);
                              await reload();
                              setDeleteAnnouncement(en ? `Deleted plan: ${plan.title}.` : `已删除排班：${plan.title}。`);
                            });
                            if (started) setPendingDeleteId((current) => current === plan.id ? null : current);
                          })()}
                        >
                          {busy === `delete:${plan.id}` ? (en ? "Deleting…" : "删除中…") : (en ? "Confirm delete" : "确认删除")}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className={CLOUD_PLAN_BUTTON_CLASS}
                          disabled={busy !== null || !plan.calculationContext || !plan.boxMatchesWorkspace}
                          aria-label={en ? `Restore plan: ${plan.title}` : `恢复排班：${plan.title}`}
                          onClick={() => onRestorePlan?.(plan)}
                        >
                          {en ? "Restore" : "恢复"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className={CLOUD_PLAN_BUTTON_CLASS}
                          disabled={busy !== null}
                          aria-label={en ? `${plan.pinned ? "Unpin" : "Pin"} plan: ${plan.title}` : `${plan.pinned ? "取消固定" : "固定"}排班：${plan.title}`}
                          onClick={() => void run(`pin:${plan.id}`, async () => {
                            await updateAccountSavedPlan(plan.id, !plan.pinned);
                            await reload();
                          })}
                        >
                          {busy === `pin:${plan.id}` ? (en ? "Updating…" : "更新中…") : plan.pinned ? (en ? "Unpin" : "取消固定") : (en ? "Pin" : "固定")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="min-h-11 px-3 text-destructive hover:bg-destructive/15 hover:text-destructive"
                          disabled={busy !== null}
                          aria-label={en ? `Delete plan: ${plan.title}` : `删除排班：${plan.title}`}
                          onClick={() => {
                            setPendingDeleteId(plan.id);
                            setDeleteAnnouncement(en ? `Confirm whether to delete plan: ${plan.title}.` : `请确认是否删除排班：${plan.title}。`);
                          }}
                        >
                          {en ? "Delete" : "删除"}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )) : <p className="text-sm leading-6 text-white/64">{en ? "Generated schedules will appear here automatically." : "生成排班后会自动出现在这里。"}</p>}
            </section>

            <section className="flex flex-col items-start gap-4 border-t border-white/14 pt-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="text-xs font-medium tracking-wide text-white/66">{en ? "Revoke sync access" : "撤销同步授权"}</h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-white/64">{en ? "Revoking deletes the cloud workspace, encrypted BOX, schedule history, and cache references. This browser continues in local-only mode." : "撤销后删除云端工作区、Box 密文、排班历史与缓存引用；浏览器继续使用本地模式。"}</p>
              </div>
              <HoldToConfirm confirmLabel={en ? "Confirmed" : "已确认"} className="w-full rounded-[22px] border-transparent bg-destructive/10 px-4 text-[13px] font-semibold text-destructive shadow-none hover:bg-destructive/20 sm:min-h-[46px] sm:w-auto sm:min-w-[196px]" disabled={busy !== null} onConfirm={() => void run("revoke", async () => {
                await revokeAccountDataConsent();
                window.localStorage.removeItem(cloudSyncMetadataKey(userId));
                window.localStorage.setItem(`cloud-consent-dismissed:${userId}:${TERMS_VERSION}:${PRIVACY_VERSION}`, "1");
                setConsent((current) => current ? { ...current, current: false, revokedAt: new Date().toISOString() } : current);
                setPlans([]);
                onCloudDataChanged?.();
              })}>{en ? "Hold to revoke and delete" : "按住撤销并删除"}</HoldToConfirm>
            </section>
            </>
          )}
        </div>
      </section>
    </InfraTechnicalCard>
  );
}
