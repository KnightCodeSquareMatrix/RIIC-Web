export interface WebsiteSessionData {
  session: {
    expiresAt: Date | string;
  };
  user: {
    id: string;
    name: string;
    email: string;
  };
}

export function parseWebsiteSession(value: unknown): WebsiteSessionData | null {
  if (!value || typeof value !== "object") return null;
  const user = "user" in value ? value.user : null;
  const session = "session" in value ? value.session : null;
  if (
    !user
    || typeof user !== "object"
    || !("id" in user)
    || typeof user.id !== "string"
    || !user.id
    || !("name" in user)
    || typeof user.name !== "string"
    || !("email" in user)
    || typeof user.email !== "string"
    || !session
    || typeof session !== "object"
    || !("expiresAt" in session)
    || (typeof session.expiresAt !== "string" && !(session.expiresAt instanceof Date))
  ) {
    return null;
  }
  return {
    session: { expiresAt: session.expiresAt },
    user: { id: user.id, name: user.name, email: user.email },
  };
}

type WebsiteSessionFetch = (
  input: string,
  init: RequestInit,
) => Promise<Pick<Response, "ok" | "json">>;

export async function requestWebsiteSession(
  fetchSession: WebsiteSessionFetch = fetch,
): Promise<WebsiteSessionData | null> {
  try {
    const response = await fetchSession("/api/auth/get-session", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!response.ok) return null;
    return parseWebsiteSession(await response.json());
  } catch {
    return null;
  }
}
