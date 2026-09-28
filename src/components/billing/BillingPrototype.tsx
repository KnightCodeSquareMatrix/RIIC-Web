"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Product = { id: string; name: string; amountFen: number; points: number; badge?: string; description: string; kind: string; checkoutConfigured: boolean };
type BillingData = {
  products: Product[];
  wallet: { paidPoints: number; monthlyPoints: number; monthlyExpiresAt: string | null; totalPoints: number };
  ledger: Array<{ id: string; kind: string; pointsDelta: number; createdAt: string; metadata?: Record<string, unknown> | null }>;
  orders: Array<{ id: string; productId: string; status: string; amountFen: number; points: number; paymentUrl: string | null; createdAt: string; paidAt: string | null }>;
  usage: Array<{ id: string; toolName: string; status: string; points: number; toolFeePoints?: number; tokenPoints?: number | null; inputTokens: number | null; outputTokens: number | null; cachedInputTokens: number | null; upstreamCostRmb: number | null; chargedCostRmb: number | null; createdAt: string }>;
};

function formatMinute(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

function orderStatus(status: string): { label: string; className: string } {
  if (status === "paid") return { label: "已付款 · 已到账", className: "text-emerald-600" };
  if (status === "cancelled" || status === "canceled") return { label: "已取消", className: "text-muted-foreground" };
  if (status === "refunded") return { label: "已退款", className: "text-amber-600" };
  return { label: "未付款 · 待支付", className: "text-amber-600" };
}

async function readBilling(): Promise<BillingData> {
  const response = await fetch("/api/billing", { credentials: "same-origin", cache: "no-store" });
  const payload = await response.json() as { data?: BillingData; error?: { message?: string } };
  if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "计费数据暂不可用。");
  return payload.data;
}

export function BillingPrototype() {
  const [data, setData] = useState<BillingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cdkCode, setCdkCode] = useState("");

  const reload = useCallback(async () => {
    try {
      setError(null);
      setData(await readBilling());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "计费数据暂不可用。");
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  // The API is ordered newest first; show the latest order so an older duplicate
  // pending order cannot hide a newer paid callback.
  const activeOrder = useMemo(() => data?.orders[0] ?? null, [data]);

  useEffect(() => {
    if (!activeOrder || activeOrder.status !== "pending") return;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/billing/orders/${encodeURIComponent(activeOrder.id)}`, { credentials: "same-origin", cache: "no-store" });
        const payload = await response.json() as { data?: { order?: { status?: string } } };
        if (!cancelled && payload.data?.order?.status === "paid") await reload();
      } catch {
        // 轮询失败不打断当前购买页，下一轮继续。
      }
    }, 5_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [activeOrder, reload]);

  const createOrder = async (productId: string) => {
    setBusy(productId);
    setNotice(null);
    try {
      const response = await fetch("/api/billing", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ productId, provider: "afdian" }),
      });
      const payload = await response.json() as { data?: { paymentUrl?: string; customOrderId?: string }; error?: { message?: string } };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "订单创建失败。");
      if (payload.data.paymentUrl) window.open(payload.data.paymentUrl, "_blank", "noopener,noreferrer");
      setNotice(`订单 ${payload.data.customOrderId ?? ""} 已创建。完成爱发电支付后，等待回调即可；当前页面提供本地模拟到账按钮。`);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "订单创建失败。");
    } finally {
      setBusy(null);
    }
  };

  const simulatePaid = async (orderId: string) => {
    setBusy(orderId);
    try {
      const response = await fetch(`/api/billing/orders/${encodeURIComponent(orderId)}/simulate-paid`, { method: "POST", credentials: "same-origin" });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "模拟到账失败。");
      setNotice("模拟支付已到账，积分余额已更新。");
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "模拟到账失败。");
    } finally {
      setBusy(null);
    }
  };

  const cdkAction = async () => {
    setBusy("cdk-redeem");
    setNotice(null);
    try {
      const response = await fetch("/api/billing/cdk", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "redeem", code: cdkCode }),
      });
      const payload = await response.json() as { data?: { code?: string; points?: number }; error?: { message?: string } };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "兑换码操作失败。");
      setCdkCode("");
      setNotice(`兑换成功，已到账 ${payload.data.points ?? 0} 积分。`);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "兑换码操作失败。");
    } finally {
      setBusy(null);
    }
  };

  if (error && !data) {
    return <main className="mx-auto grid min-h-dvh w-full max-w-4xl content-start gap-4 px-4 py-10"><h1 className="text-2xl font-medium">Agent 积分与用量</h1><div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm"><p>{error}</p><a className="mt-3 inline-block underline underline-offset-4" href="/">返回首页登录</a></div></main>;
  }
  if (!data) return <main className="mx-auto grid min-h-dvh w-full max-w-4xl place-items-center px-4 py-10 text-sm text-muted-foreground">正在加载积分账户……</main>;

  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-4xl content-start gap-5 px-4 py-8" data-billing-prototype>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs text-muted-foreground">可露希尔助理</p><h1 className="text-2xl font-medium">积分与用量</h1><p className="mt-1 text-sm text-muted-foreground">求解工具每次 1 积分 · 纯对话按 Token 实际用量计费 · 金额统一为人民币</p></div>
        <a className="text-sm underline underline-offset-4" href="/agent">返回 Agent</a>
      </header>

      {notice ? <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">{notice}</div> : null}
      {error ? <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</div> : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">可用积分</p><p className="mt-1 font-number text-3xl">{data.wallet.totalPoints}</p></div>
        <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">永久积分</p><p className="mt-1 font-number text-2xl">{data.wallet.paidPoints}</p></div>
        <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">月卡积分</p><p className="mt-1 font-number text-2xl">{data.wallet.monthlyPoints}</p><p className="mt-1 text-xs text-muted-foreground">{data.wallet.monthlyExpiresAt ? `到期 ${new Date(data.wallet.monthlyExpiresAt).toLocaleDateString("zh-CN")}` : "暂无有效月卡"}</p></div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {data.products.map((product) => (
          <article key={product.id} className="grid gap-3 rounded-xl border bg-card p-4">
            <div className="flex items-start justify-between gap-2"><div><h2 className="font-medium">{product.name}</h2><p className="mt-1 text-2xl font-number">￥{(product.amountFen / 100).toFixed( product.amountFen % 100 ? 1 : 0 )}</p></div>{product.badge ? <span className="rounded-full bg-[#FFD501] px-2 py-0.5 text-xs text-black">{product.badge}</span> : null}</div>
            <p className="text-sm text-muted-foreground">{product.description}</p>
            <button type="button" className="h-9 rounded-lg bg-[#FFD501] px-3 text-sm font-medium text-black disabled:opacity-50" disabled={busy !== null || !product.checkoutConfigured} onClick={() => void createOrder(product.id)}>{busy === product.id ? "创建中…" : product.checkoutConfigured ? "爱发电购买" : "待配置支付链接"}</button>
          </article>
        ))}
      </section>

      {activeOrder ? <section className="rounded-xl border border-dashed p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-medium">最近订单</h2><p className="mt-1 text-sm text-muted-foreground">{activeOrder.productId} · {activeOrder.points} 积分 · {activeOrder.status === "paid" ? `到账于 ${formatMinute(activeOrder.paidAt ?? activeOrder.createdAt)}` : `创建于 ${formatMinute(activeOrder.createdAt)}`}</p></div><div className="flex flex-wrap items-center gap-2"><span className={`text-sm ${orderStatus(activeOrder.status).className}`}>{orderStatus(activeOrder.status).label}</span>{activeOrder.status === "pending" ? <button type="button" className="h-9 rounded-lg border px-3 text-sm hover:bg-muted disabled:opacity-50" disabled={busy !== null} onClick={() => void simulatePaid(activeOrder.id)}>{busy === activeOrder.id ? "处理中…" : "模拟爱发电回调到账"}</button> : null}</div></div><p className="mt-3 text-xs text-muted-foreground">爱发电付款成功后，积分会自动发放到当前登录账号，无需填写 CDK。CDK 仅用于赠送码核销。</p><div className="mt-3 grid gap-2 border-t pt-3 text-sm">{data.orders.slice(0, 6).map((order) => <div key={order.id} className="flex flex-wrap items-center justify-between gap-2"><span>{order.productId} · ￥{(order.amountFen / 100).toFixed(order.amountFen % 100 ? 1 : 0)} · {formatMinute(order.createdAt)}</span><span className={orderStatus(order.status).className}>{orderStatus(order.status).label}</span></div>)}</div></section> : null}

      <section className="grid gap-4 rounded-xl border bg-card p-4">
        <div className="grid content-start gap-2"><h2 className="font-medium">核销兑换码</h2><p className="text-sm text-muted-foreground">兑换成功后积分进入当前登录账号的永久余额。</p><input className="h-9 rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring" aria-label="积分兑换码" placeholder="RIIC-..." value={cdkCode} onChange={(event) => setCdkCode(event.target.value)} /><button type="button" className="h-9 w-fit rounded-lg bg-[#FFD501] px-3 text-sm font-medium text-black disabled:opacity-50" disabled={busy !== null || !cdkCode.trim()} onClick={() => void cdkAction()}>核销并入账</button></div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4"><h2 className="font-medium">最近扣费</h2><div className="mt-3 grid gap-2 text-sm">{data.usage.length === 0 ? <p className="text-muted-foreground">还没有 Agent 工具消耗。</p> : data.usage.slice(0, 8).map((item) => <div key={item.id} className="flex items-center justify-between gap-3 border-b pb-2 last:border-0"><span>{item.toolName}<span className="ml-2 text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString("zh-CN")}</span>{item.inputTokens != null ? <span className="mt-0.5 block text-xs text-muted-foreground">输入 {item.inputTokens} · 输出 {item.outputTokens ?? 0} · 缓存命中 {item.cachedInputTokens ?? 0}</span> : null}{item.status === "completed_unsettled" ? <span className="mt-0.5 block text-xs text-amber-600">余额不足，部分费用待结算</span> : null}</span><span className="text-right"><span className="block font-number">-{item.points} 积分</span>{item.toolFeePoints != null || item.tokenPoints != null ? <span className="block text-xs text-muted-foreground">工具 {item.toolFeePoints ?? 0} · Token {item.tokenPoints ?? 0}</span> : null}{item.upstreamCostRmb != null ? <span className="block text-xs text-muted-foreground">上游 ￥{item.upstreamCostRmb.toFixed(2)}</span> : null}{item.chargedCostRmb != null ? <span className="block text-xs text-muted-foreground">本站 ￥{item.chargedCostRmb.toFixed(2)}</span> : null}</span></div>)}</div></div>
        <div className="rounded-xl border bg-card p-4"><h2 className="font-medium">积分账本</h2><div className="mt-3 grid gap-2 text-sm">{data.ledger.length === 0 ? <p className="text-muted-foreground">充值或使用 Agent 后会显示在这里。</p> : data.ledger.slice(0, 8).map((item) => <div key={item.id} className="flex items-center justify-between gap-3 border-b pb-2 last:border-0"><span><span className="block">{item.kind === "topup" ? "充值到账" : item.kind === "monthly_grant" ? "月卡到账" : item.kind === "cdk_issue" ? "生成 CDK" : item.kind === "cdk_redeem" ? "CDK 核销" : "求解工具"}</span><span className="block text-xs text-muted-foreground">{formatMinute(item.createdAt)}</span></span><span className={`font-number ${item.pointsDelta > 0 ? "text-emerald-600" : "text-muted-foreground"}`}>{item.pointsDelta > 0 ? "+" : ""}{item.pointsDelta}</span></div>)}</div></div>
      </section>
      <p className="text-xs leading-5 text-muted-foreground">当前页面是支付联调原型：订单、账本、余额和重复回调幂等逻辑已经接通；正式上线前把爱发电签名校验、支付宝渠道与上游模型人民币单价配置补齐。</p>
    </main>
  );
}
