import "server-only";

import { eq } from "drizzle-orm";
import { PublicApiError } from "@/server/api-contract";
import { getDatabase } from "@/server/db";
import { user } from "@/server/db/schema";
import { websiteSession } from ".";
import { websiteAdminAccess } from "./admin-access";

export async function requireWebsiteSession(request: Request | Headers) {
  let session;
  try {
    session = await websiteSession(request);
  } catch (cause) {
    throw new PublicApiError("AIC-AUTH-2008", { cause });
  }
  if (!session?.user?.id) throw new PublicApiError("AIC-AUTH-2008");
  return session;
}

export async function requireWebsiteAdmin(request: Request | Headers) {
  const session = await requireWebsiteSession(request);
  const [record] = await getDatabase()
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1);
  const access = websiteAdminAccess(session.user.id, record?.role);
  if (!access.isAdmin) throw new PublicApiError("AIC-AUTH-2009");
  return { session, ...access };
}
