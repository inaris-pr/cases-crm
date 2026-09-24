/**
 * Request-level authentication and same-origin protection for /api.
 *
 * A request either carries a valid session or gets 401. What the employee
 * may then do is decided per route in auth/authorize.ts (RBAC Phase 3).
 */
import type { NextFunction, Request, Response } from "express";
import type { Session, User } from "../store.js";
import { config, type AppConfig } from "../config.js";
import { resolveSession, sessionTokenFrom } from "./sessions.js";

export interface AuthContext {
  user: User;
  session: Session;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by authenticate(); present on every route registered after it. */
      auth?: AuthContext;
    }
  }
}

/**
 * Requires a live session. The X-User header, and any name in a request
 * body, are never used to establish identity.
 */
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = sessionTokenFrom(req);
  const resolved = token ? resolveSession(token) : null;
  if (!resolved) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  req.auth = resolved;
  next();
}

/** The authenticated employee. Only valid on routes behind authenticate(). */
export function requireAuth(req: Request): AuthContext {
  if (!req.auth) {
    // Programming error: a route that needs identity was registered before
    // authenticate(). Fail loudly rather than act as nobody.
    throw Object.assign(new Error("unauthenticated"), { status: 401 });
  }
  return req.auth;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** "http://host:port" for a URL, or null if it is not an http(s) URL. */
function originOf(value: string): string | null {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:" ? u.origin : null;
  } catch {
    return null;
  }
}

/** Origins, other than this API's own host, that may send state-changing requests. */
export function allowedRequestOrigins(cfg: AppConfig = config): Set<string> {
  return new Set([...cfg.trustedFrontendOrigins, ...cfg.corsAllowedOrigins]);
}

/**
 * CSRF defence in depth (the session cookie is also SameSite=Lax).
 *
 * A state-changing request that says where it came from — its Origin, or
 * failing that its Referer — is accepted only if that origin is either
 *
 *   1. this API itself: same host as the request's Host header (a browser
 *      talking to the API directly, or a proxy that preserves Host), or
 *   2. listed exactly (scheme, host and port) in TRUSTED_FRONTEND_ORIGINS
 *      (default: the Vite dev server, http://127.0.0.1:5173 and
 *      http://localhost:5173) or CORS_ALLOWED_ORIGINS.
 *
 * Rule 2 exists because the Vite dev server proxies /api with
 * changeOrigin: true, so the API sees Host 127.0.0.1:3001 while the browser's
 * Origin is http://127.0.0.1:5173. X-Forwarded-* headers are NOT consulted:
 * Vite does not send them (xfwd is off), and any client can forge them.
 *
 * Requests with neither Origin nor Referer (curl, server-to-server, tests)
 * are allowed — browsers always send Origin on cross-site POSTs — and they
 * still need a valid session to do anything.
 */
export function createSameOriginGuard(cfg: AppConfig = config) {
  const listedOrigins = allowedRequestOrigins(cfg);
  return function requireSameOrigin(req: Request, res: Response, next: NextFunction) {
    if (SAFE_METHODS.has(req.method)) return next();

    const originHeader = req.headers.origin;
    const refererHeader = req.headers.referer;
    if (originHeader === undefined && refererHeader === undefined) return next();

    // An opaque origin ("null": sandboxed iframe, file://, some redirects) is never trusted.
    const source = typeof originHeader === "string" ? originHeader : refererHeader;
    const sourceOrigin = typeof source === "string" && source !== "null" ? originOf(source) : null;

    const requestHost = (req.headers.host ?? "").toLowerCase();
    const sameHost = sourceOrigin !== null && new URL(sourceOrigin).host === requestHost;
    const listed = sourceOrigin !== null && listedOrigins.has(sourceOrigin);

    if (!sameHost && !listed) {
      res.status(403).json({ error: "origin_not_allowed" });
      return;
    }
    next();
  };
}

/** The guard used by the API, configured from the environment. */
export const requireSameOrigin = createSameOriginGuard(config);
