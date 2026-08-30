import { createHash } from "node:crypto";

import {
  createClient,
  STORAGE_CREDENTIAL_KEY,
  STORAGE_DID_KEY,
  STORAGE_OAUTH_TOKEN_KEY,
  STORAGE_USER_ID_KEY,
  type Client,
} from "skland-kit";

import type { SklandQrStatusResponse, SklandScheduleSnapshot, SklandStatusSnapshot } from "@/types";
import type { SklandPolicyConsentRequest } from "@/legal-policy";
import { DeviceIdCache } from "./device-id-cache";
import { rolesFromBinding, snapshotFromPlayerInfo, snapshotsFromPlayerInfo } from "./normalize";
import { sklandLayoutSuggestion } from "./layout-suggestion";
import {
  SKLAND_SESSION_TTL_SECONDS,
  type SklandPolicyConsent,
  type SklandSessionPayload,
} from "./session";

const SCAN_TTL_MS = 10 * 60 * 1000;
const SCAN_TTL_SECONDS = SCAN_TTL_MS / 1000;
const TOKEN_REFRESH_MS = 20 * 60 * 1000;

type PendingScan = {
  client: Client;
  createdAt: number;
  lastPollAt: number;
  policyConsent: SklandPolicyConsent;
};

type RateEntry = { timestamps: number[] };

declare global {
  var __infraCalcSklandScans: Map<string, PendingScan> | undefined;
  var __infraCalcSklandRate: Map<string, RateEntry> | undefined;
  var __infraCalcSklandDeviceIdCache: DeviceIdCache | undefined;
}

const pendingScans = globalThis.__infraCalcSklandScans ?? new Map<string, PendingScan>();
const rateEntries = globalThis.__infraCalcSklandRate ?? new Map<string, RateEntry>();
const deviceIdCache = globalThis.__infraCalcSklandDeviceIdCache ?? new DeviceIdCache();
globalThis.__infraCalcSklandScans = pendingScans;
globalThis.__infraCalcSklandRate = rateEntries;
globalThis.__infraCalcSklandDeviceIdCache = deviceIdCache;

export class SklandServiceError extends Error {
  constructor(
    public readonly code:
      | "NOT_CONFIGURED"
      | "INSECURE"
      | "RATE_LIMITED"
      | "AUTH_EXPIRED"
      | "UNAVAILABLE"
      | "BAD_DATA",
    message: string,
    public readonly status = 500
  ) {
    super(message);
  }
}

function cleanupScans(now = Date.now()): void {
  for (const [scanId, scan] of pendingScans) {
    if (now - scan.createdAt > SCAN_TTL_MS) pendingScans.delete(scanId);
  }
  for (const [key, entry] of rateEntries) {
    const timestamps = entry.timestamps.filter((timestamp) => now - timestamp < SCAN_TTL_MS);
    if (timestamps.length === 0) rateEntries.delete(key);
    else rateEntries.set(key, { timestamps });
  }
}

function assertRate(key: string, limit: number, windowMs: number, now = Date.now()): void {
  const current = rateEntries.get(key)?.timestamps.filter((timestamp) => now - timestamp < windowMs) ?? [];
  if (current.length >= limit) throw new SklandServiceError("RATE_LIMITED", "操作过于频繁，请稍后再试。", 429);
  current.push(now);
  rateEntries.set(key, { timestamps: current });
}

function publicError(error: unknown): SklandServiceError {
  if (error instanceof SklandServiceError) return error;
  const message = error instanceof Error ? error.message : String(error);
  const cause = error && typeof error === "object" && "cause" in error ? (error as { cause?: unknown }).cause : null;
  const causeMessage = cause && typeof cause === "object" && "msg" in cause ? String((cause as { msg?: unknown }).msg ?? "") : "";
  const combinedMessage = `${message} ${causeMessage}`;
  if (/cred|token|认证|unauthor|用户未登录|登录失效/i.test(combinedMessage)) return new SklandServiceError("AUTH_EXPIRED", "森空岛登录已失效，请重新扫码。", 401);
  if (/429|频繁|limit/i.test(combinedMessage)) return new SklandServiceError("RATE_LIMITED", "森空岛请求过于频繁，请稍后再试。", 429);
  return new SklandServiceError("UNAVAILABLE", "森空岛暂时不可用，请稍后重试；MAA 导入仍可正常使用。", 502);
}

export function scanStatusFromError(error: unknown): "waiting" | "scanned" | "expired" | null {
  const cause = error && typeof error === "object" && "cause" in error ? (error as { cause?: unknown }).cause : null;
  if (!cause || typeof cause !== "object" || !("status" in cause)) return null;
  const status = Number((cause as { status?: unknown }).status);
  if (status === 100) return "waiting";
  if (status === 101) return "scanned";
  if (status === 102) return "expired";
  return null;
}

function scanDisplayStatus(raw: string): "waiting" | "scanned" | "expired" {
  const value = raw.toLowerCase();
  if (/expire|invalid|失效|过期|-1/.test(value)) return "expired";
  if (/scanned|confirm|已扫码|待确认/.test(value) || value === "1") return "scanned";
  return "waiting";
}

async function seedClient(payload: SklandSessionPayload): Promise<Client> {
  const client = createClient({ timeout: 30_000 });
  await client.storage.setItems([
    { key: STORAGE_CREDENTIAL_KEY, value: payload.cred },
    { key: STORAGE_OAUTH_TOKEN_KEY, value: payload.token },
    { key: STORAGE_DID_KEY, value: payload.dId },
    { key: STORAGE_USER_ID_KEY, value: payload.userId },
  ]);
  return client;
}

async function refreshedPayload(client: Client, payload: SklandSessionPayload, force = false): Promise<SklandSessionPayload> {
  if (!force && Date.now() - payload.refreshedAt < TOKEN_REFRESH_MS) return payload;
  const { token } = await client.refresh();
  return { ...payload, token, refreshedAt: Date.now() };
}

async function scheduleWithClient(client: Client, payload: SklandSessionPayload): Promise<{
  payload: SklandSessionPayload;
  snapshot: SklandScheduleSnapshot;
  statusSnapshot: SklandStatusSnapshot;
}> {
  const binding = await client.collections.player.getBinding();
  const roles = rolesFromBinding(binding);
  if (roles.length === 0) throw new SklandServiceError("BAD_DATA", "该森空岛账号没有绑定可用的明日方舟角色。", 422);
  const selectedUid = roles.some((role) => role.uid === payload.selectedUid)
    ? payload.selectedUid
    : roles.find((role) => role.isDefault)?.uid ?? roles[0].uid;
  const info = await client.collections.player.getInfo({ uid: selectedUid });
  const snapshots = snapshotsFromPlayerInfo(info, roles, selectedUid, sklandLayoutSuggestion(info));
  return {
    payload: { ...payload, selectedUid },
    snapshot: snapshots.scheduleSnapshot,
    statusSnapshot: snapshots.statusSnapshot,
  };
}

async function completeOAuthLogin(
  client: Client,
  oauthToken: string,
  policyConsent: SklandPolicyConsent
): Promise<{
  session: SklandSessionPayload;
  snapshot: SklandScheduleSnapshot;
  statusSnapshot: SklandStatusSnapshot;
}> {
  const grant = await client.collections.hypergryph.grantAuthorizeCode(oauthToken);
  const auth = await client.signIn(grant.code);
  const binding = await client.collections.player.getBinding();
  const roles = rolesFromBinding(binding);
  if (roles.length === 0) {
    throw new SklandServiceError("BAD_DATA", "该森空岛账号没有绑定可用的明日方舟角色。", 422);
  }
  const selectedUid = roles.find((role) => role.isDefault)?.uid ?? roles[0].uid;
  const info = await client.collections.player.getInfo({ uid: selectedUid });
  const dId = (await client.storage.getItem(STORAGE_DID_KEY)) ?? "";
  if (!dId) throw new SklandServiceError("BAD_DATA", "森空岛设备凭证生成失败。", 502);
  const session: SklandSessionPayload = {
    version: 3,
    cred: auth.cred,
    token: auth.token,
    dId,
    userId: auth.userId,
    selectedUid,
    refreshedAt: Date.now(),
    expiresAt: Date.now() + SKLAND_SESSION_TTL_SECONDS * 1000,
    policyConsent,
  };
  const snapshots = snapshotsFromPlayerInfo(info, roles, selectedUid, sklandLayoutSuggestion(info));
  return {
    session,
    snapshot: snapshots.scheduleSnapshot,
    statusSnapshot: snapshots.statusSnapshot,
  };
}

export function requestIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function startScan(
  ip: string,
  consent: SklandPolicyConsentRequest
): Promise<{ scanId: string; scanUrl: string; expiresInSeconds: number }> {
  cleanupScans();
  assertRate(`scan:${ip}`, 10, 10 * 60 * 1000);
  assertRate("scan:global", 50, 10 * 60 * 1000);
  try {
    const client = createClient({ timeout: 30_000 });
    const result = await deviceIdCache.run(
      client.storage,
      STORAGE_DID_KEY,
      () => client.collections.hypergryph.generateScanLoginUrl()
    );
    pendingScans.set(result.scanId, {
      client,
      createdAt: Date.now(),
      lastPollAt: 0,
      policyConsent: {
        termsVersion: consent.termsVersion,
        privacyVersion: consent.privacyVersion,
        acceptedAt: Date.now(),
      },
    });
    return { ...result, expiresInSeconds: SCAN_TTL_SECONDS };
  } catch (error) {
    throw publicError(error);
  }
}

export async function pollScan(scanId: string): Promise<{
  response: SklandQrStatusResponse;
  session?: SklandSessionPayload;
}> {
  cleanupScans();
  const pending = pendingScans.get(scanId);
  if (!pending) return { response: { success: false, status: "expired", error: "二维码已失效，请刷新后重试。", code: "AUTH_EXPIRED" } };
  const now = Date.now();
  if (now - pending.lastPollAt < 1_000) return { response: { success: true, status: "waiting" } };
  pending.lastPollAt = now;
  try {
    const status = await pending.client.collections.hypergryph.getScanStatus(scanId);
    if (!status.scanCode) return { response: { success: true, status: scanDisplayStatus(status.scanStatus ?? "") } };

    const oauthToken = await pending.client.collections.hypergryph.getOAuthTokenByScanCode(status.scanCode);
    const completed = await completeOAuthLogin(pending.client, oauthToken, pending.policyConsent);
    pendingScans.delete(scanId);
    return {
      response: {
        success: true,
        status: "authenticated",
        scheduleSnapshot: completed.snapshot,
        statusSnapshot: completed.statusSnapshot,
      },
      session: completed.session,
    };
  } catch (error) {
    const status = scanStatusFromError(error);
    if (status) {
      if (status === "expired") pendingScans.delete(scanId);
      return {
        response: {
          success: status !== "expired",
          status,
          ...(status === "expired" ? { error: "二维码已失效，请刷新后重试。", code: "AUTH_EXPIRED" } : {}),
        },
      };
    }
    const known = publicError(error);
    if (known.code === "AUTH_EXPIRED") pendingScans.delete(scanId);
    throw known;
  }
}

export async function loadSessionSnapshot(payload: SklandSessionPayload, forceRefresh = false): Promise<{
  session: SklandSessionPayload;
  snapshot: SklandScheduleSnapshot;
  statusSnapshot: SklandStatusSnapshot;
}> {
  try {
    const client = await seedClient(payload);
    const refreshed = await refreshedPayload(client, payload, forceRefresh);
    if (refreshed.token !== payload.token) await client.storage.setItem(STORAGE_OAUTH_TOKEN_KEY, refreshed.token);
    const result = await scheduleWithClient(client, refreshed);
    return {
      session: result.payload,
      snapshot: result.snapshot,
      statusSnapshot: result.statusSnapshot,
    };
  } catch (error) {
    throw publicError(error);
  }
}

export async function syncSessionSnapshot(payload: SklandSessionPayload): Promise<{
  session: SklandSessionPayload;
  snapshot: SklandScheduleSnapshot;
  statusSnapshot: SklandStatusSnapshot;
}> {
  const key = createHash("sha256").update(payload.cred).digest("hex").slice(0, 24);
  assertRate(`sync:${key}`, 30, 60 * 60_000);
  return loadSessionSnapshot(payload, true);
}

export async function selectSessionRole(payload: SklandSessionPayload, uid: string): Promise<{
  session: SklandSessionPayload;
  snapshot: SklandScheduleSnapshot;
  statusSnapshot: SklandStatusSnapshot;
}> {
  if (!uid.trim()) throw new SklandServiceError("BAD_DATA", "缺少要切换的角色 UID。", 400);
  return loadSessionSnapshot({ ...payload, selectedUid: uid.trim() });
}

export async function loadStatusSnapshot(payload: SklandSessionPayload): Promise<{
  session: SklandSessionPayload;
  snapshot: SklandStatusSnapshot;
}> {
  try {
    const client = await seedClient(payload);
    const refreshed = await refreshedPayload(client, payload);
    if (refreshed.token !== payload.token) await client.storage.setItem(STORAGE_OAUTH_TOKEN_KEY, refreshed.token);
    const binding = await client.collections.player.getBinding();
    const roles = rolesFromBinding(binding);
    if (roles.length === 0) throw new SklandServiceError("BAD_DATA", "该森空岛账号没有绑定可用的明日方舟角色。", 422);
    const selectedUid = roles.some((role) => role.uid === refreshed.selectedUid)
      ? refreshed.selectedUid
      : roles.find((role) => role.isDefault)?.uid ?? roles[0].uid;
    const info = await client.collections.player.getInfo({ uid: selectedUid });
    return {
      session: { ...refreshed, selectedUid },
      snapshot: snapshotFromPlayerInfo(info, roles, selectedUid, sklandLayoutSuggestion(info)),
    };
  } catch (error) {
    throw publicError(error);
  }
}
