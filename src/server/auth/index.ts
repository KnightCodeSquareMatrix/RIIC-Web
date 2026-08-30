import "server-only";

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { admin, emailOTP } from "better-auth/plugins";
import { getDatabase } from "@/server/db";
import { websiteAccountNameDatabaseHooks } from "./account-name-hooks";
import { sendAuthEmail } from "./email";
import { configuredAdminIds, requireAuthBaseUrl, requireAuthSecret } from "./config";

function createAuth() {
  return betterAuth({
    appName: "可露希尔基建终端",
    baseURL: requireAuthBaseUrl(),
    secret: requireAuthSecret(),
    database: drizzleAdapter(getDatabase(), { provider: "pg" }),
    databaseHooks: websiteAccountNameDatabaseHooks,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      requireEmailVerification: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: ({ user, url }) => sendAuthEmail({ to: user.email, url, kind: "reset" }),
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: false,
      expiresIn: 10 * 60,
    },
    rateLimit: { enabled: true, storage: "database" },
    user: { deleteUser: { enabled: true } },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 10 * 60,
        allowedAttempts: 5,
        storeOTP: "hashed",
        overrideDefaultEmailVerification: true,
        sendVerificationOTP: ({ email, otp, type }) => {
          if (type !== "email-verification") throw new Error("Only email verification OTP delivery is enabled.");
          return sendAuthEmail({ to: email, code: otp, kind: "verify-code" });
        },
      }),
      admin({ adminUserIds: [...configuredAdminIds()], defaultRole: "user" }),
    ],
  });
}

type Auth = ReturnType<typeof createAuth>;
const state = globalThis as typeof globalThis & { __aicAuth?: Auth };

export function getAuth(): Auth {
  return state.__aicAuth ??= createAuth();
}

export async function websiteSession(request: Request | Headers) {
  return getAuth().api.getSession({ headers: request instanceof Headers ? request : request.headers });
}
