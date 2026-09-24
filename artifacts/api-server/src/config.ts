/**
 * Runtime configuration, read once from the environment and validated.
 *
 * Every tunable security number lives here under a name, with its default
 * and its allowed range, so nothing in the auth code is a bare magic number.
 * An invalid value stops the server at startup with a message naming the
 * variable, instead of silently falling back.
 */

export const DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES = 8 * 60; // 8 hours
export const DEFAULT_SESSION_ABSOLUTE_TIMEOUT_DAYS = 7;
export const DEFAULT_LOGIN_MAX_FAILURES_PER_ACCOUNT = 5;
export const DEFAULT_LOGIN_MAX_FAILURES_PER_IP = 20;
export const DEFAULT_LOGIN_THROTTLE_WINDOW_MINUTES = 15;
export const DEFAULT_API_HOST = "127.0.0.1";
export const DEFAULT_API_PORT = 3001;
/**
 * Browser origins of the Vite dev server (see artifacts/cases/vite.config.ts).
 * The dev server listens on 127.0.0.1 only, so these are only reachable from
 * this machine. Both names are listed because the same server answers to both.
 */
export const DEFAULT_TRUSTED_FRONTEND_ORIGINS = ["http://127.0.0.1:5173", "http://localhost:5173"];

export type CookieSecureMode = "auto" | "always" | "never";

export interface AppConfig {
  /** A session ends after this long without a request. */
  sessionIdleTimeoutMinutes: number;
  /** A session ends this long after login, however active it is. */
  sessionAbsoluteTimeoutDays: number;
  /** Failed logins for one email inside the window before it is locked. */
  loginMaxFailuresPerAccount: number;
  /** Failed logins from one IP address inside the window before it is locked. */
  loginMaxFailuresPerIp: number;
  loginThrottleWindowMinutes: number;
  /** Interface the API listens on. 127.0.0.1 keeps it off the local network. */
  apiHost: string;
  apiPort: number;
  /** "auto": Secure cookie only when the request arrived over HTTPS. */
  sessionCookieSecure: CookieSecureMode;
  /** Extra origins allowed to call the API cross-origin. Empty = same-origin only. */
  corsAllowedOrigins: string[];
  /**
   * Origins of the app's own frontend when it reaches the API through a
   * reverse proxy (the Vite dev server). Such requests arrive with the
   * proxy's rewritten Host, so the same-origin check needs to know the
   * frontend's origin explicitly. No CORS headers are sent for these.
   */
  trustedFrontendOrigins: string[];
}

export class ConfigError extends Error {}

type Env = Record<string, string | undefined>;

function intSetting(env: Env, key: string, fallback: number, min: number, max: number): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === "") return fallback;
  if (!/^\d+$/.test(raw.trim())) {
    throw new ConfigError(`${key} must be a whole number between ${min} and ${max} (got "${raw}")`);
  }
  const n = Number(raw.trim());
  if (n < min || n > max) {
    throw new ConfigError(`${key} must be between ${min} and ${max} (got ${n})`);
  }
  return n;
}

export function loadConfig(env: Env = process.env): AppConfig {
  const sessionIdleTimeoutMinutes = intSetting(
    env, "SESSION_IDLE_TIMEOUT_MINUTES", DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES, 5, 7 * 24 * 60,
  );
  const sessionAbsoluteTimeoutDays = intSetting(
    env, "SESSION_ABSOLUTE_TIMEOUT_DAYS", DEFAULT_SESSION_ABSOLUTE_TIMEOUT_DAYS, 1, 90,
  );
  if (sessionIdleTimeoutMinutes > sessionAbsoluteTimeoutDays * 24 * 60) {
    throw new ConfigError(
      "SESSION_IDLE_TIMEOUT_MINUTES cannot be longer than SESSION_ABSOLUTE_TIMEOUT_DAYS",
    );
  }

  const secureRaw = (env.SESSION_COOKIE_SECURE ?? "auto").trim().toLowerCase();
  if (secureRaw !== "auto" && secureRaw !== "always" && secureRaw !== "never") {
    throw new ConfigError(`SESSION_COOKIE_SECURE must be auto, always or never (got "${secureRaw}")`);
  }

  const apiHost = (env.API_HOST ?? "").trim() || DEFAULT_API_HOST;

  const corsAllowedOrigins = originList(env, "CORS_ALLOWED_ORIGINS", []);
  // Unset → the local dev-server origins; set to "" → none.
  const trustedFrontendOrigins = originList(env, "TRUSTED_FRONTEND_ORIGINS", DEFAULT_TRUSTED_FRONTEND_ORIGINS);

  return {
    sessionIdleTimeoutMinutes,
    sessionAbsoluteTimeoutDays,
    loginMaxFailuresPerAccount: intSetting(
      env, "LOGIN_MAX_FAILURES_PER_ACCOUNT", DEFAULT_LOGIN_MAX_FAILURES_PER_ACCOUNT, 1, 100,
    ),
    loginMaxFailuresPerIp: intSetting(
      env, "LOGIN_MAX_FAILURES_PER_IP", DEFAULT_LOGIN_MAX_FAILURES_PER_IP, 1, 1000,
    ),
    loginThrottleWindowMinutes: intSetting(
      env, "LOGIN_THROTTLE_WINDOW_MINUTES", DEFAULT_LOGIN_THROTTLE_WINDOW_MINUTES, 1, 24 * 60,
    ),
    apiHost,
    apiPort: intSetting(env, "PORT", DEFAULT_API_PORT, 1, 65535),
    sessionCookieSecure: secureRaw,
    corsAllowedOrigins,
    trustedFrontendOrigins,
  };
}

/** A comma-separated list of bare origins (scheme://host[:port]), validated. */
function originList(env: Env, key: string, fallback: string[]): string[] {
  const raw = env[key];
  if (raw === undefined) return [...fallback];
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const origin of list) {
    let valid = false;
    try {
      const u = new URL(origin);
      valid = (u.protocol === "http:" || u.protocol === "https:") && u.origin === origin;
    } catch {
      valid = false;
    }
    if (!valid) {
      throw new ConfigError(`${key} entries must be bare origins like https://crm.example.com (got "${origin}")`);
    }
  }
  return list;
}

export const config: AppConfig = loadConfig();
