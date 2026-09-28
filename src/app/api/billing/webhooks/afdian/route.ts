import { createRequestId, failureResponse, readJsonBody, PublicApiError } from "@/server/api-contract";
import { findAfdianOrderByOutTradeNo } from "@/server/billing/afdian";
import { fulfillBillingOrder } from "@/server/billing/service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AfdianPrototypePayload = {
  custom_order_id?: unknown;
  out_trade_no?: unknown;
  status?: unknown;
  ec?: unknown;
  data?: {
    type?: unknown;
    order?: {
      out_trade_no?: unknown;
      status?: unknown;
      total_amount?: unknown;
      remark?: unknown;
      custom_order_id?: unknown;
    };
  };
};

function afdianAck(requestId: string, data: Record<string, unknown> = {}) {
  return NextResponse.json({ ec: 200, em: "", data: { ...data, request_id: requestId } }, { status: 200, headers: { "X-Request-Id": requestId } });
}

// Afdian's dashboard tester may probe the configured address with GET before
// sending the real JSON POST webhook. Keep this probe fast and return the same
// success envelope used by the provider callback.
export async function GET() {
  return afdianAck(createRequestId(), { accepted: true, method: "health_check" });
}

export async function POST(request: Request) {
  const requestId = createRequestId();
  const startedAt = performance.now();
  try {
    const expected = process.env.AFDIAN_WEBHOOK_SECRET?.trim();
    if (expected && request.headers.get("x-afdian-prototype-secret") !== expected) {
      throw new PublicApiError("AIC-BILLING-4104");
    }
    const body = await readJsonBody(request, 64 * 1024) as AfdianPrototypePayload;
    const order = body.data?.order;
    let customOrderIdCandidates = [
      body.custom_order_id,
      order?.custom_order_id,
      order?.remark,
    ].filter((value): value is string => typeof value === "string" && /^riic-[a-z0-9]+$/i.test(value.trim()));
    const outTradeNo = typeof order?.out_trade_no === "string" ? order.out_trade_no : typeof body.out_trade_no === "string" ? body.out_trade_no : undefined;
    let queriedOrder = null;
    if (customOrderIdCandidates.length === 0 && outTradeNo) {
      try {
        queriedOrder = await findAfdianOrderByOutTradeNo(outTradeNo);
        if (queriedOrder?.custom_order_id || queriedOrder?.remark) {
          customOrderIdCandidates = [queriedOrder.custom_order_id, queriedOrder.remark].filter((value): value is string => typeof value === "string" && /^riic-[a-z0-9]+$/i.test(value.trim()));
        }
      } catch (error) {
        console.warn(JSON.stringify({ level: "warn", event: "afdian_query_order_failed", requestId, outTradeNo, message: error instanceof Error ? error.message : String(error) }));
      }
    }
    const customOrderId = customOrderIdCandidates[0] ?? null;
    const status = queriedOrder?.status ?? order?.status ?? body.status;
    const totalAmount = queriedOrder?.total_amount !== undefined
      ? Number(queriedOrder.total_amount)
      : typeof order?.total_amount === "string" || typeof order?.total_amount === "number" ? Number(order.total_amount) : undefined;
    console.info(JSON.stringify({
      level: "info",
      event: "afdian_webhook_received",
      requestId,
      outTradeNo,
      customOrderId,
      status,
      totalAmount,
      matched: Boolean(customOrderId),
    }));
    if (!customOrderId || (status !== undefined && Number(status) !== 2)) {
      return afdianAck(requestId, { accepted: false, reason: "payment_not_success_or_unmatched" });
    }
    if (totalAmount === undefined || !Number.isFinite(totalAmount)) {
      return afdianAck(requestId, { accepted: false, reason: "payment_amount_missing" });
    }
    const result = await fulfillBillingOrder({
      customOrderId,
      providerOrderId: outTradeNo,
      amountFen: Math.round(totalAmount * 100),
    });
    return afdianAck(requestId, { accepted: true, idempotent: result.idempotent });
  } catch (error) {
    return failureResponse(error, requestId, "/api/billing/webhooks/afdian", startedAt, "AIC-SYS-5000", request);
  }
}
