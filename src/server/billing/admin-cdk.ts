import "server-only";

import { desc } from "drizzle-orm";
import { getDatabase } from "@/server/db";
import { billingCdk } from "@/server/db/schema";
import { CdkValidationError, hashCdk, parseAdminCdkInput, randomCdk } from "./cdk";

/** Grants new promotional points; unlike user gift codes, no wallet is debited. */
export async function issueAdminCdks(issuerUserId: string, value: unknown) {
  const input = parseAdminCdkInput(value);
  const codes = input.codes ?? Array.from({ length: input.count }, randomCdk);
  try {
    // One INSERT is atomic. Stable primary keys also prevent retrying a batch
    // after an ambiguous network response from creating additional grants.
    await getDatabase().insert(billingCdk).values(codes.map((code, index) => ({
      id: `admin:${input.batchId}:${index}`,
      issuerUserId,
      codeHash: hashCdk(code),
      points: input.points,
    })));
  } catch (error) {
    const cause = error instanceof Error && error.cause ? error.cause : error;
    if (cause && typeof cause === "object" && "code" in cause && cause.code === "23505") {
      throw new CdkValidationError("此批次已生成或兑换码已存在，未新增任何兑换码。请先查看发放记录；明文仅首次成功时返回。");
    }
    throw error;
  }
  return { batchId: input.batchId, points: input.points, codes };
}

export async function listAdminCdks() {
  const rows = await getDatabase().select({
    id: billingCdk.id, points: billingCdk.points, status: billingCdk.status,
    issuerUserId: billingCdk.issuerUserId, redeemerUserId: billingCdk.redeemerUserId,
    createdAt: billingCdk.createdAt, redeemedAt: billingCdk.redeemedAt,
  }).from(billingCdk).orderBy(desc(billingCdk.createdAt), desc(billingCdk.id)).limit(100);
  return rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString(), redeemedAt: row.redeemedAt?.toISOString() ?? null }));
}
