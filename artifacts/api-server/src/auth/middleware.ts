/**
 * Request-level authentication and same-origin protection for /api.
 *
 * Phase 1 = authentication only: a request either carries a valid session or
 * gets 401. What an authenticated employee may do is Phase 2/3.
 */
import type { NextFunction, Request, Response } from "express";
import type { Session, User } from "../store.js";
import { config } from "../config.js";
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

function hostOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * CSRF defence in depth (the session cookie is also SameSite=Lax): a
 * state-changing request that says where it came from (Origin, or failing
 * that Referer) must come from this same host, or from an origin listed in
 * CORS_ALLOWED_ORIGINS. Requests with neither header (curl, server-to-server,
 * tests) are allowed — browsers always send Origin on cross-site POSTs.
 */
export function requireSameOrigin(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.headers.origin;
  const source = typeof origin === "string" && origin !== "null" ? origin : req.headers.referer;
  if (origin === "null") {
    res.status(403).json({ error: "origin_not_allowed" });
    return;
  }
  if (!source) return next();
  const sourceHost = hostOf(source);
  const requestHost = (req.headers.host ?? "").toLowerCase();
  const allowed =
    (sourceHost !== null && sourceHost === requestHost) ||
    config.corsAllowedOrigins.some((o) => hostOf(o) === sourceHost && source.startsWith(o));
  if (!allowed) {
    res.status(403).json({ error: "origin_not_allowed" });
    return;
  }
  next();
}
