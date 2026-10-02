import assert from "node:assert/strict";
import { register, registerHooks } from "node:module";
import test from "node:test";
import type { AfdianOrder } from "./afdian.ts";

register("../../../scripts/ts-path-loader.mjs", import.meta.url);
registerHooks({ resolve(specifier, context, next) {
  return specifier === "server-only" ? { shortCircuit: true, url: "data:text/javascript,export{}" } : next(specifier, context);
} });

test("payment callback uses only verified provider data and rejects forged payments", async (t) => {
  const originalEnv = { ...process.env };
  t.after(() => { process.env = originalEnv; });
  let verified: AfdianOrder | null = null;
  const writes: unknown[] = [];
  await t.mock.module(new URL("../api-contract.ts", import.meta.url), { namedExports: {
    PublicApiError: class extends Error {}, createRequestId: () => "test",
    readJsonBody: (request: Request) => request.json(),
    failureResponse: () => Response.json({}, { status: 403 }),
  } });
  await t.mock.module(new URL("./afdian.ts", import.meta.url), { namedExports: { findAfdianOrderByOutTradeNo: async () => verified } });
  await t.mock.module(new URL("./service.ts", import.meta.url), { namedExports: {
    fulfillBillingOrder: async (input: unknown) => { writes.push(input); return { idempotent: false }; },
  } });
  process.env.AFDIAN_WEBHOOK_SECRET = "";
  const { POST } = await import("../../app/api/billing/webhooks/afdian/route.ts");
  const request = (trade = "real-trade") => new Request("https://riic.test/api/billing/webhooks/afdian", {
    method: "POST", body: JSON.stringify({ custom_order_id: "riic-forged", out_trade_no: trade, status: 2,
      data: { order: { custom_order_id: "riic-forged", total_amount: "999", status: 2 } } }),
  });
  assert.equal((await POST(request())).status, 403);
  verified = { out_trade_no: "other-trade", custom_order_id: "riic-real", status: 2, total_amount: "1" };
  assert.equal((await POST(request())).status, 403);
  verified.out_trade_no = "real-trade";
  verified.status = 0;
  assert.equal((await (await POST(request())).json()).data.accepted, false);
  delete verified.status;
  assert.equal((await (await POST(request())).json()).data.accepted, false);
  assert.equal(writes.length, 0);
  verified.status = 2;
  assert.equal((await (await POST(request())).json()).data.accepted, true);
  assert.deepEqual(writes, [{ customOrderId: "riic-real", providerOrderId: "real-trade", amountFen: 100 }]);
  process.env.AFDIAN_WEBHOOK_SECRET = "test-only-secret";
  assert.equal((await POST(request())).status, 403);
  assert.equal(writes.length, 1);
});
