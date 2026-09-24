"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock3, Download, RefreshCw, ScanLine, Search, Trash2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SklandPolicyConsent, currentSklandPolicyConsent } from "@/skland-policy-consent";
import { groupGachaPools, mergeGachaRecords, type GachaHistory, type GachaRecord } from "@/gacha-history";
import { downloadJson } from "@/download";

type Scan = { scanId: string; scanUrl: string; expiresInSeconds: number };
type ApiResult<T> = { success: true; data: T } | { success: false; error: { message: string } };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const result = await response.json() as ApiResult<T>;
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}

function storageKey(uid: string) { return `aic-gacha-history-v1:${uid}`; }

export default function GachaHistoryTab({ uid }: { uid?: string }) {
  const [selectedUid, setSelectedUid] = useState(() => uid ?? (typeof window !== "undefined" ? window.localStorage.getItem("aic-gacha-last-uid-v1") ?? "" : ""));
  const [roles, setRoles] = useState<Array<{ uid: string; nickname: string }>>([]);
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [gachaConsent, setGachaConsent] = useState(false);
  const [scan, setScan] = useState<Scan | null>(null);
  const [scanStatus, setScanStatus] = useState("idle");
  const [authorized, setAuthorized] = useState(false);
  const [syncAfterScan, setSyncAfterScan] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<GachaHistory | null>(null);
  const [selectedPool, setSelectedPool] = useState("all");
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(100);

  useEffect(() => {
    let active = true;
    void api<{ roles: Array<{ uid: string; nickname: string }> }>("/api/gacha/session")
      .then((result) => {
        if (!active || !result.roles.length) return;
        setRoles(result.roles);
        setAuthorized(true);
        setSelectedUid((current) => result.roles.some((role) => role.uid === current) ? current : result.roles[0]!.uid);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (uid) setSelectedUid(uid);
  }, [uid]);

  useEffect(() => {
    setSelectedPool("all");
    setVisibleCount(100);
    if (!selectedUid) { setHistory(null); return; }
    try {
      const value = window.localStorage.getItem(storageKey(selectedUid));
      const stored = value ? JSON.parse(value) as GachaHistory : null;
      setHistory(stored?.uid === selectedUid && Array.isArray(stored.records) ? stored : null);
    } catch { setHistory(null); }
  }, [selectedUid]);

  const refresh = useCallback(async () => {
    if (!selectedUid) return;
    setBusy(true); setError(null);
    try {
      const incoming = await api<GachaHistory>(`/api/gacha/history?${new URLSearchParams({ uid: selectedUid })}`);
      const previous = (() => {
        try { return JSON.parse(window.localStorage.getItem(storageKey(incoming.uid)) ?? "null") as GachaHistory | null; }
        catch { return null; }
      })();
      const merged = { ...incoming, records: mergeGachaRecords(previous?.records ?? [], incoming.records) };
      window.localStorage.setItem(storageKey(incoming.uid), JSON.stringify(merged));
      window.localStorage.setItem("aic-gacha-last-uid-v1", incoming.uid);
      setHistory(merged);
      setAuthorized(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "寻访记录读取失败。"); }
    finally { setBusy(false); }
  }, [selectedUid]);

  async function startScan() {
    setBusy(true); setError(null); setScan(null);
    try {
      const result = await api<Scan>("/api/gacha/qr", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: currentSklandPolicyConsent(), gachaConsent: true }),
      });
      setScan(result); setScanStatus("waiting");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "二维码生成失败。"); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    if (!scan || scanStatus === "authenticated" || scanStatus === "expired") return;
    let cancelled = false;
    let inFlight = false;
    const poll = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const result = await api<{ status: string; roles: Array<{ uid: string; nickname: string }> }>("/api/gacha/qr/status", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scanId: scan.scanId }),
        });
        if (cancelled) return;
        setScanStatus(result.status);
        if (result.status === "authenticated") {
          setScan(null);
          setAuthorized(true);
          setSyncAfterScan(true);
          setRoles(result.roles);
          const nextUid = result.roles.some((role) => role.uid === uid) ? uid! : result.roles[0]?.uid ?? "";
          setSelectedUid(nextUid);
        }
      } catch (cause) {
        if (!cancelled) { setError(cause instanceof Error ? cause.message : "扫码状态读取失败。"); setScan(null); }
      } finally { inFlight = false; }
    };
    const timer = window.setInterval(() => void poll(), 3000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [scan, scanStatus, refresh, selectedUid, uid]);

  useEffect(() => {
    if (!syncAfterScan || !authorized || !selectedUid || !roles.length) return;
    setSyncAfterScan(false);
    void refresh();
  }, [syncAfterScan, authorized, selectedUid, roles, refresh]);

  async function disconnect() {
    setBusy(true);
    try {
      await api<{ disconnected: boolean }>("/api/gacha/session", { method: "DELETE" });
      setAuthorized(false); setRoles([]); setScan(null); setScanStatus("idle");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "解除授权失败。"); }
    finally { setBusy(false); }
  }

  const pools = useMemo(() => groupGachaPools(history?.records ?? []), [history]);
  const matchingPools = useMemo(() => pools.map((group) => ({
    ...group,
    records: group.records.filter((record) =>
      (selectedPool === "all" || group.key === selectedPool)
      && (!query || `${record.charName} ${group.name} ${group.upSixStars.join(" ")} ${group.upFiveStars.join(" ")}`.toLowerCase().includes(query.toLowerCase()))
    ),
  })).filter((group) => group.records.length > 0), [pools, selectedPool, query]);
  const matchingCount = matchingPools.reduce((count, group) => count + group.records.length, 0);
  const visibleIds = new Set(matchingPools.flatMap((group) => group.records).slice(0, visibleCount).map((record) => record.id));
  const visiblePools = matchingPools.map((group) => ({
    ...group,
    records: group.records.filter((record) => visibleIds.has(record.id)),
  })).filter((group) => group.records.length > 0);
  const sixStars = history?.records.filter((record) => record.stars === 6).length ?? 0;
  const latest = history?.records[0];

  return <section className="mx-auto w-full max-w-7xl space-y-5" data-gacha-history>
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
      <div><h3 className="text-lg font-semibold">寻访记录</h3><p className="text-sm text-muted-foreground">{history ? `${history.nickname} · ${history.records.length} 抽已保存` : "明日方舟账号扫码授权后读取"}</p></div>
      <div className="flex gap-2">
        {authorized && <Button type="button" variant="outline" disabled={busy} onClick={() => void refresh()}><RefreshCw className={busy ? "animate-spin" : ""} />刷新</Button>}
        {authorized && <Button type="button" variant="outline" disabled={busy} onClick={() => void disconnect()}>解除授权</Button>}
        {history && <Button type="button" variant="outline" onClick={() => downloadJson(`arknights-gacha-${history.uid}.json`, history)}><Download />导出</Button>}
        {history && <Button type="button" variant="outline" aria-label="清除本地寻访记录" onClick={() => { if (!window.confirm("清除当前角色保存在此浏览器的寻访记录？")) return; window.localStorage.removeItem(storageKey(selectedUid)); setHistory(null); }}><Trash2 />清除</Button>}
      </div>
    </header>
    {!authorized && <div className="grid gap-5 border border-border p-5 sm:grid-cols-[minmax(0,1fr)_240px] sm:p-6">
      <div className="max-w-xl space-y-4">
        <p className="text-sm leading-6 text-muted-foreground">请用森空岛 App 扫码，并在手机上确认。本站将读取该鹰角账号绑定的明日方舟角色与寻访记录；账号凭证只在服务端内存保留一小时，记录保存在当前浏览器。</p>
        <SklandPolicyConsent termsAccepted={terms} privacyAccepted={privacy} onTermsChange={setTerms} onPrivacyChange={setPrivacy} />
        <label className="flex items-start gap-2 text-xs leading-5"><input type="checkbox" className="mt-1 size-4 accent-primary" checked={gachaConsent} onChange={(event) => setGachaConsent(event.target.checked)} />我同意读取明日方舟寻访记录，并保存在当前浏览器。</label>
        <Button type="button" disabled={!terms || !privacy || !gachaConsent || busy} onClick={() => void startScan()}><ScanLine />{scan ? "刷新二维码" : "扫码授权"}</Button>
        {scan && <p className="text-sm text-muted-foreground">{scanStatus === "scanned" ? "已扫码，请在手机上确认" : scanStatus === "expired" ? "二维码已过期，请刷新" : "等待扫码确认"}</p>}
      </div>
      <div className="grid min-h-56 place-items-center border border-border bg-white p-4">{scan ? <QRCodeSVG value={scan.scanUrl} size={196} marginSize={1} /> : <ScanLine className="size-12 text-neutral-400" />}</div>
    </div>}
    {error && <p role="alert" className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
    {roles.length > 1 && <label className="flex items-center gap-2 text-sm">角色<select className="h-9 min-w-40 border border-border bg-background px-3" value={selectedUid} onChange={(event) => setSelectedUid(event.target.value)}>{roles.map((role) => <option key={role.uid} value={role.uid}>{role.nickname}</option>)}</select></label>}
    {history && <>
      <div className="grid gap-4 border-y border-border py-4 sm:grid-cols-3">
        <div><p className="text-xs text-muted-foreground">已保存寻访</p><strong className="font-number text-2xl">{history.records.length}</strong></div>
        <div><p className="text-xs text-muted-foreground">六星干员</p><strong className="font-number text-2xl">{sixStars}</strong></div>
        <div><p className="text-xs text-muted-foreground">最近记录</p><strong className="font-number text-sm">{latest ? new Date(latest.timestamp).toLocaleDateString("zh-CN") : "暂无"}</strong></div>
      </div>
      {history.warnings.map((warning) => <p key={warning} className="text-sm text-amber-700">{warning}</p>)}
      <div className="flex flex-wrap gap-2">
        <label className="relative min-w-48 flex-1 sm:max-w-80"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索干员或卡池" /></label>
        <select className="h-9 min-w-40 max-w-full border border-border bg-background px-3 text-sm sm:max-w-80" aria-label="选择卡池" value={selectedPool} onChange={(event) => { setSelectedPool(event.target.value); setVisibleCount(100); }}><option value="all">全部卡池</option>{pools.map((group) => <option value={group.key} key={group.key}>{group.name}{group.upSixStars.length ? ` · UP ${group.upSixStars.join("、")}` : ""} · {group.records.length} 抽</option>)}</select>
      </div>
      <div className="space-y-7">
        {visiblePools.map((group) => <section key={group.key} className="border-t border-border" aria-label={group.name}>
          <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-b border-border bg-muted/30 px-3 py-3">
            <div className="min-w-0">
              <h4 className="text-base font-semibold break-words">{group.name}</h4>
              {group.upSixStars.length > 0 && <p className="mt-1 text-sm text-amber-700">6★ UP：{group.upSixStars.join("、")}</p>}
              {group.upFiveStars.length > 0 && <p className="mt-0.5 text-xs text-muted-foreground">5★ UP：{group.upFiveStars.join("、")}</p>}
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">{group.records.length} / {pools.find((pool) => pool.key === group.key)?.records.length ?? group.records.length} 抽 · {group.sixStars} 六星</span>
          </header>
          <div className="divide-y divide-border">
            {group.records.map((record: GachaRecord) => <div key={record.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 text-sm">
              <div className="min-w-0"><strong className={record.stars === 6 ? "text-amber-600" : ""}>{record.charName}</strong><span className="ml-2 text-xs text-muted-foreground">{record.stars}★{record.isNew ? " · NEW" : ""}</span></div>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="size-3.5" />{new Date(record.timestamp).toLocaleString("zh-CN")}</span>
            </div>)}
          </div>
        </section>)}
        {!matchingCount && <p className="border-y border-border py-12 text-center text-sm text-muted-foreground">暂无符合条件的记录</p>}
      </div>
      {matchingCount > visibleCount && <div className="text-center"><Button type="button" variant="outline" onClick={() => setVisibleCount((count) => count + 100)}>加载更多</Button></div>}
      <p className="text-xs text-muted-foreground">UP 按卡池 ID 匹配游戏卡池资料；资料缺失的卡池只显示原名。</p>
      <p className="text-xs text-muted-foreground">上次同步：{new Date(history.fetchedAt).toLocaleString("zh-CN")}。官方接口可回溯范围有限，已保存的旧记录不会在刷新时删除。</p>
    </>}
  </section>;
}
