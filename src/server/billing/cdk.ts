import { createHash, randomBytes } from "node:crypto";

export class CdkValidationError extends Error {}

export function normalizeCdk(code: string): string {
  return code.trim().toUpperCase();
}

export function validCdk(code: string): boolean {
  return /^[A-Z0-9][A-Z0-9_-]{7,63}$/.test(normalizeCdk(code));
}

export function hashCdk(code: string): string {
  return createHash("sha256").update(normalizeCdk(code)).digest("hex");
}

export function randomCdk(): string {
  return `RIIC-${randomBytes(18).toString("hex").toUpperCase()}`;
}

export type AdminCdkInput = { batchId: string; count: number; points: number; codes?: string[] };

export function parseAdminCdkInput(value: unknown): AdminCdkInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CdkValidationError("请填写兑换码配置。");
  const input = value as Record<string, unknown>;
  if (typeof input.batchId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.batchId)) {
    throw new CdkValidationError("批次编号无效，请刷新页面后重试。");
  }
  if (typeof input.count !== "number" || !Number.isInteger(input.count) || input.count < 1 || input.count > 100) {
    throw new CdkValidationError("每批兑换码数量须为 1–100 个。");
  }
  if (typeof input.points !== "number" || !Number.isInteger(input.points) || input.points < 1 || input.points > 100_000) {
    throw new CdkValidationError("每个兑换码的积分须为 1–100000 的整数。");
  }
  let codes: string[] | undefined;
  if (input.codes !== undefined) {
    if (!Array.isArray(input.codes) || input.codes.length !== input.count || input.codes.some(code => typeof code !== "string" || !validCdk(code))) {
      throw new CdkValidationError("自定义码数量须与生成数量一致，每个码为 8–64 位英文字母、数字、短横线或下划线。");
    }
    codes = input.codes.map(code => normalizeCdk(code as string));
    if (new Set(codes).size !== codes.length) throw new CdkValidationError("自定义兑换码不能重复（不区分大小写）。");
  }
  return { batchId: input.batchId.toLowerCase(), count: input.count, points: input.points, ...(codes ? { codes } : {}) };
}
