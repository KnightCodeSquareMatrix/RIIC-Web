import type { AdminSessionData, AdminUserData } from "../../types.ts";
import { websiteAdminAccess } from "./admin-access.ts";

type AdminUserRecord = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  role: string | null;
  banned: boolean | null;
  banReason: string | null;
  createdAt: Date;
  sklandBindingCount: number;
  sklandActiveBindingCount: number;
  sklandRenewalDueCount: number;
};

type AdminSessionRecord = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
};

export function toAdminUserData(record: AdminUserRecord, bootstrapAdminIds: Set<string>): AdminUserData {
  const access = websiteAdminAccess(record.id, record.role, bootstrapAdminIds);
  return {
    id: record.id,
    name: record.name,
    email: record.email,
    emailVerified: record.emailVerified,
    banned: record.banned,
    banReason: record.banReason,
    createdAt: record.createdAt.toISOString(),
    isAdmin: access.isAdmin,
    isBootstrapAdmin: access.isBootstrapAdmin,
    sklandBindingCount: record.sklandBindingCount,
    sklandActiveBindingCount: record.sklandActiveBindingCount,
    sklandRenewalDueCount: record.sklandRenewalDueCount,
  };
}

export function toAdminSessionData(record: AdminSessionRecord): AdminSessionData {
  return {
    id: record.id,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    expiresAt: record.expiresAt.toISOString(),
    ipAddress: record.ipAddress,
    userAgent: record.userAgent,
  };
}
