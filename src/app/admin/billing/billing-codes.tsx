"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAdminRequest } from "../admin-context";

type CodeRecord = { id: string; points: number; status: string; issuerUserId: string; redeemerUserId: string | null; createdAt: string; redeemedAt: string | null };
type IssuedBatch = { batchId: string; points: number; codes: string[] };

export function BillingCodes() {
  const t = useTranslations("AdminWorkspace");
  const locale = useLocale();
  const request = useAdminRequest();
  const [count, setCount] = useState("20");
  const [points, setPoints] = useState("30");
  const [custom, setCustom] = useState("");
  const [batch, setBatch] = useState<IssuedBatch | null>(null);
  const [records, setRecords] = useState<CodeRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const batchId = useRef<string | null>(null);
  const issuing = useRef(false);
  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const data = await request<{ codes: CodeRecord[] }>("/api/admin/billing/cdk", { cache: "no-store" }, t("cdkLoadFailed"));
      setRecords(data.codes);
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : t("cdkLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [request, t]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (issuing.current || batch) return;
    issuing.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      batchId.current ??= crypto.randomUUID();
      const codes = custom.trim() ? custom.trim().split(/\r?\n/).map(code => code.trim()).filter(Boolean) : undefined;
      const data = await request<IssuedBatch>("/api/admin/billing/cdk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId: batchId.current, count: Number(count), points: Number(points), codes }),
      }, t("cdkGenerateFailed"));
      setBatch(data);
      void refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("cdkGenerateFailed"));
      // Keep the batch ID after failures: the server may have committed even
      // when a response was lost. A retry must not issue extra points.
      void refresh();
    } finally {
      issuing.current = false;
      setBusy(false);
    }
  }

  async function copy() {
    if (!batch) return;
    try {
      await navigator.clipboard.writeText(batch.codes.join("\n"));
      setNotice(t("cdkCopied"));
    } catch {
      setNotice(t("cdkCopyFailed"));
    }
  }

  function download() {
    if (!batch) return;
    const blob = new Blob([`# ${batch.points} points / code\n${batch.codes.join("\n")}\n`], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `riic-codes-${batch.batchId}.txt`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(t("cdkDownloaded"));
  }

  const total = Number(count) * Number(points);
  return <>
    <form onSubmit={generate} className="grid gap-5 rounded-xl border bg-card p-5 sm:p-6">
      <div><h2 className="font-semibold">{t("cdkCreate")}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{t("cdkGrantHint")}</p></div>
      <fieldset disabled={busy || Boolean(batch)} className="grid gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm" htmlFor="cdk-count">{t("cdkCount")}<Input id="cdk-count" type="number" min={1} max={100} step={1} required value={count} onChange={event => setCount(event.target.value)} /></label>
          <label className="grid gap-2 text-sm" htmlFor="cdk-points">{t("cdkPoints")}<Input id="cdk-points" type="number" min={1} max={100000} step={1} required value={points} onChange={event => setPoints(event.target.value)} /></label>
        </div>
        <label className="grid gap-2 text-sm" htmlFor="cdk-custom">{t("cdkCustom")}<Textarea id="cdk-custom" value={custom} onChange={event => setCustom(event.target.value)} maxLength={7000} rows={4} spellCheck={false} autoCapitalize="characters" autoComplete="off" aria-describedby="cdk-custom-hint" /><span id="cdk-custom-hint" className="text-xs leading-5 text-muted-foreground">{t("cdkCustomHint")}</span></label>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm" aria-live="polite">{t("cdkTotal", { count: Number.isFinite(total) ? total : 0 })}</p>
          <Button type="submit" disabled={busy || Boolean(batch)}>{t(busy ? "cdkGenerating" : "cdkGenerate")}</Button>
        </div>
      </fieldset>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </form>
    {batch && <section className="grid gap-4 rounded-xl border bg-card p-5 sm:p-6" aria-labelledby="cdk-result-title">
      <div><h2 id="cdk-result-title" className="font-semibold">{t("cdkGenerated", { count: batch.codes.length, points: batch.points })}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{t("cdkSaveHint")}</p><p className="mt-1 break-all font-mono text-xs text-muted-foreground">{batch.batchId}</p></div>
      <Textarea aria-label={t("cdkResult")} readOnly value={batch.codes.join("\n")} rows={8} className="font-mono text-xs" spellCheck={false} />
      <div className="flex flex-wrap gap-2"><Button type="button" onClick={() => void copy()}>{t("cdkCopy")}</Button><Button type="button" variant="outline" onClick={download}>{t("cdkDownload")}</Button><Button type="button" variant="ghost" onClick={() => { setBatch(null); batchId.current = null; setNotice(""); setCustom(""); }}>{t("cdkNextBatch")}</Button></div>
      <p role="status" className="text-sm text-muted-foreground">{notice}</p>
    </section>}
    <section className="grid min-w-0 gap-4 rounded-xl border bg-card p-5 sm:p-6" aria-labelledby="cdk-history-title">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="cdk-history-title" className="font-semibold">{t("cdkHistory")}</h2><Button type="button" variant="outline" disabled={loading} onClick={() => void refresh()}>{t(loading ? "cdkLoading" : "cdkRefresh")}</Button></div>
      <p className="text-sm text-muted-foreground">{t("cdkHistoryHint")}</p>
      {loadError && <p role="alert" className="text-sm text-destructive">{loadError}</p>}
      {!loading && !loadError && records.length === 0 && <p className="text-sm text-muted-foreground">{t("cdkEmpty")}</p>}
      {records.length > 0 && <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <thead><tr className="border-b text-muted-foreground">{(["cdkId", "cdkPoints", "status", "cdkIssuedAt", "cdkRedeemer"] as const).map(key => <th scope="col" key={key} className="px-3 py-3 font-medium whitespace-nowrap">{t(key)}</th>)}</tr></thead>
        <tbody>{records.map(record => <tr key={record.id} className="border-b last:border-0">
          <td className="max-w-64 break-all px-3 py-3 font-mono text-xs">{record.id}</td><td className="px-3 py-3">{record.points}</td>
          <td className="px-3 py-3 whitespace-nowrap">{record.status === "issued" ? t("cdkIssued") : record.status === "redeemed" ? t("cdkRedeemed") : record.status}</td>
          <td className="px-3 py-3 whitespace-nowrap">{new Date(record.createdAt).toLocaleString(locale)}</td>
          <td className="max-w-64 break-all px-3 py-3 text-xs">{record.redeemerUserId ?? "—"}{record.redeemedAt && <div className="mt-1 text-muted-foreground">{new Date(record.redeemedAt).toLocaleString(locale)}</div>}</td>
        </tr>)}</tbody>
      </table></div>}
    </section>
  </>;
}
