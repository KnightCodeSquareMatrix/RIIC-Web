import assert from "node:assert/strict";
import test from "node:test";
import { canChangeWebsiteAdminRole, canModerateWebsiteUser, isEligibleForWebsiteAdmin, websiteAdminAccess } from "./admin-access.ts";
import { configuredAdminIds, requireAuthBaseUrl, requireAuthSecret } from "./config.ts";
import { localDevelopmentAuthBypassEnabled, localDevelopmentAuthBypassSession } from "./local-bypass.ts";

test("Better Auth secret must contain at least 32 UTF-8 bytes", () => {
  assert.throws(() => requireAuthSecret("short"), /32 bytes/);
  assert.equal(requireAuthSecret("x".repeat(32)), "x".repeat(32));
  assert.equal(requireAuthSecret("密".repeat(11)), "密".repeat(11));
});

test("Better Auth base URL must be an HTTPS origin outside local development", () => {
  assert.equal(requireAuthBaseUrl("https://auth.example.test", "production"), "https://auth.example.test");
  assert.equal(requireAuthBaseUrl("http://127.0.0.1:5174", "development"), "http://127.0.0.1:5174");
  assert.throws(() => requireAuthBaseUrl("http://127.0.0.1:5174", "production"), /HTTPS/);
  assert.throws(() => requireAuthBaseUrl("http://auth.example.test", "development"), /HTTPS/);
  assert.throws(() => requireAuthBaseUrl("https://auth.example.test/path", "production"), /origin/);
});

test("local auth bypass is restricted to the development server on port 5174", () => {
  const enabledEnvironment = { LOCAL_AUTH_BYPASS: "1", NODE_ENV: "development", APP_DEPLOYMENT_ENV: "development" };
  assert.equal(localDevelopmentAuthBypassEnabled(new Request("http://127.0.0.1:5174/"), enabledEnvironment), true);
  assert.equal(localDevelopmentAuthBypassEnabled(new Request("http://localhost:5174/"), enabledEnvironment), true);
  assert.equal(localDevelopmentAuthBypassEnabled(new Headers({ host: "localhost:5174" }), enabledEnvironment), true);
  assert.equal(localDevelopmentAuthBypassEnabled(new Request("http://127.0.0.1:5175/"), enabledEnvironment), false);
  assert.equal(localDevelopmentAuthBypassEnabled(new Request("https://riic.autos/"), enabledEnvironment), false);
  assert.equal(localDevelopmentAuthBypassEnabled(new Request("http://127.0.0.1:5174/"), { ...enabledEnvironment, NODE_ENV: "production" }), false);
  assert.equal(localDevelopmentAuthBypassEnabled(new Request("http://127.0.0.1:5174/"), { ...enabledEnvironment, APP_DEPLOYMENT_ENV: "production" }), false);
  assert.equal(localDevelopmentAuthBypassEnabled(new Request("http://127.0.0.1:5174/"), { ...enabledEnvironment, NODE_ENV: undefined }), false);
  assert.equal(localDevelopmentAuthBypassEnabled(new Request("https://127.0.0.1:5174/"), enabledEnvironment), false);
  assert.equal(localDevelopmentAuthBypassEnabled(new Request("http://127.0.0.1:5174/"), { ...enabledEnvironment, LOCAL_AUTH_BYPASS: "0" }), false);
});

test("local auth bypass returns a verified long-lived development identity", () => {
  const session = localDevelopmentAuthBypassSession(
    new Request("http://127.0.0.1:5174/api/auth/get-session"),
    { LOCAL_AUTH_BYPASS: "1", NODE_ENV: "development", APP_DEPLOYMENT_ENV: "development" },
  );
  assert.equal(session?.user.id, "local-development-user");
  assert.equal(session?.user.emailVerified, true);
  assert.ok(session && session.session.expiresAt.getUTCFullYear() === 2099);
});

test("administrator ids are explicit, trimmed Better Auth user ids", () => {
  assert.deepEqual([...configuredAdminIds(" user-one, user-two, user-one, ,")], ["user-one", "user-two"]);
  assert.equal(configuredAdminIds("").size, 0);
});

test("bootstrap administrators can delegate without creating an administrator chain", () => {
  const bootstrapIds = new Set(["bootstrap"]);
  const bootstrap = websiteAdminAccess("bootstrap", "user", bootstrapIds);
  const delegated = websiteAdminAccess("delegated", "admin", bootstrapIds);
  const regular = websiteAdminAccess("regular", "user", bootstrapIds);

  assert.deepEqual(bootstrap, {
    userId: "bootstrap",
    isAdmin: true,
    isBootstrapAdmin: true,
    canManageAdminRoles: true,
  });
  assert.equal(delegated.isAdmin, true);
  assert.equal(delegated.canManageAdminRoles, false);
  assert.equal(regular.isAdmin, false);
  assert.equal(canChangeWebsiteAdminRole(bootstrap, delegated), true);
  assert.equal(canChangeWebsiteAdminRole(delegated, regular), false);
  assert.equal(canChangeWebsiteAdminRole(bootstrap, bootstrap), false);
  assert.equal(canModerateWebsiteUser(delegated, bootstrap), false);
  assert.equal(canModerateWebsiteUser(bootstrap, bootstrap), true);
  assert.equal(canModerateWebsiteUser(delegated, regular), true);
});

test("only the exact database admin role grants delegated access", () => {
  const bootstrapIds = new Set<string>();
  assert.equal(websiteAdminAccess("user", "admin", bootstrapIds).isAdmin, true);
  assert.equal(websiteAdminAccess("user", "ADMIN", bootstrapIds).isAdmin, false);
  assert.equal(websiteAdminAccess("user", null, bootstrapIds).isAdmin, false);
});

test("only verified and unbanned accounts are eligible for delegated administration", () => {
  assert.equal(isEligibleForWebsiteAdmin(true, false), true);
  assert.equal(isEligibleForWebsiteAdmin(true, null), true);
  assert.equal(isEligibleForWebsiteAdmin(false, false), false);
  assert.equal(isEligibleForWebsiteAdmin(true, true), false);
});
