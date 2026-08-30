import { configuredAdminIds } from "./config.ts";

export const WEBSITE_ADMIN_ROLE = "admin";
export const WEBSITE_USER_ROLE = "user";

export type WebsiteAdminAccess = {
  userId: string;
  isAdmin: boolean;
  isBootstrapAdmin: boolean;
  canManageAdminRoles: boolean;
};

export function websiteAdminAccess(
  userId: string,
  role: unknown,
  bootstrapAdminIds = configuredAdminIds(),
): WebsiteAdminAccess {
  const isBootstrapAdmin = bootstrapAdminIds.has(userId);
  return {
    userId,
    isAdmin: isBootstrapAdmin || role === WEBSITE_ADMIN_ROLE,
    isBootstrapAdmin,
    canManageAdminRoles: isBootstrapAdmin,
  };
}

export function canChangeWebsiteAdminRole(
  actor: WebsiteAdminAccess,
  target: WebsiteAdminAccess,
): boolean {
  return actor.canManageAdminRoles && !target.isBootstrapAdmin;
}

export function canModerateWebsiteUser(
  actor: WebsiteAdminAccess,
  target: WebsiteAdminAccess,
): boolean {
  return !target.isBootstrapAdmin || actor.isBootstrapAdmin;
}

export function isEligibleForWebsiteAdmin(emailVerified: boolean, banned: boolean | null): boolean {
  return emailVerified && !banned;
}
