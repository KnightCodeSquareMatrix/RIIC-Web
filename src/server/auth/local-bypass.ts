const LOCAL_BYPASS_USER_ID = "local-development-user";
const LOCAL_BYPASS_PORT = "5174";
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

interface LocalBypassEnvironment {
  APP_DEPLOYMENT_ENV?: string;
  LOCAL_AUTH_BYPASS?: string;
  NODE_ENV?: string;
}

function requestUrl(request: Request | Headers): URL | null {
  if (request instanceof Request) {
    try {
      return new URL(request.url);
    } catch {
      return null;
    }
  }

  const host = request.get("host");
  if (!host) return null;
  try {
    return new URL(`http://${host}`);
  } catch {
    return null;
  }
}

export function localDevelopmentAuthBypassEnabled(
  request: Request | Headers,
  environment: LocalBypassEnvironment = process.env,
): boolean {
  if (environment.LOCAL_AUTH_BYPASS !== "1") return false;
  if (environment.NODE_ENV !== "development" || environment.APP_DEPLOYMENT_ENV !== "development") return false;

  const url = requestUrl(request);
  return Boolean(
    url
    && url.protocol === "http:"
    && LOCAL_HOSTNAMES.has(url.hostname)
    && url.port === LOCAL_BYPASS_PORT,
  );
}

export function localDevelopmentAuthBypassSession(
  request: Request | Headers,
  environment: LocalBypassEnvironment = process.env,
) {
  if (!localDevelopmentAuthBypassEnabled(request, environment)) return null;

  const createdAt = new Date("2020-01-01T00:00:00.000Z");
  const expiresAt = new Date("2099-12-31T23:59:59.999Z");
  return {
    session: {
      id: "local-development-session",
      token: "local-development-session",
      userId: LOCAL_BYPASS_USER_ID,
      createdAt,
      updatedAt: createdAt,
      expiresAt,
      ipAddress: null,
      userAgent: "local-development-bypass",
    },
    user: {
      id: LOCAL_BYPASS_USER_ID,
      name: "Local Preview",
      email: "local-preview@localhost.invalid",
      emailVerified: true,
      image: null,
      createdAt,
      updatedAt: createdAt,
      role: "user",
      banned: false,
      banReason: null,
      banExpires: null,
    },
  };
}
