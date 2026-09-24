/**
 * Server-side sessions.
 *
 * Login creates a random 256-bit token, sends it to the browser in an
 * HttpOnly cookie, and stores only its SHA-256 in store.sessions. A session
 * ends at whichever comes first:
 *   - idle limit:     SESSION_IDLE_TIMEOUT_MINUTES since the last request
 *   - absolute limit: SESSION_ABSOLUTE_TIMEOUT_DAYS since login
 *   - logout, or the user being deactivated.
 */
import { createHash, randomBytes } from "node:crypto";
import type { Request } from "express";
import { config, type AppConfig } from "../config.js";
import { nextSessionId, store, type Session, type User } from "../store.js";

export const SESSION_COOKIE_NAME = "cases_session";
/** The cookie is only sent to the API. */
export const SESSION_COOKIE_PATH = "/api";
const TOKEN_BYTES = 32;

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function idleTimeoutMs(cfg: AppConfig = config) {
  return cfg.sessionIdleTimeoutMinutes * MINUTE_MS;
}
export function absoluteTimeoutMs(cfg: AppConfig = config) {
  return cfg.sessionAbsoluteTimeoutDays * DAY_MS;
}

function isExpired(s: Session, nowMs: number): boolean {
  const absoluteEnd = Date.parse(s.expiresAt);
  const idleEnd = Date.parse(s.lastSeenAt) + idleTimeoutMs();
  return !(nowMs < absoluteEnd) || !(nowMs < idleEnd);
}

/** Drops expired sessions and sessions of missing or inactive users. */
export function pruneSessions(now: Date = new Date()): number {
  const nowMs = now.getTime();
  const before = store.sessions.length;
  store.sessions = store.sessions.filter((s) => {
    const user = store.users.find((u) => u.id === s.userId);
    return user?.active === true && !isExpired(s, nowMs);
  });
  return before - store.sessions.length;
}

export function createSession(userId: number, now: Date = new Date()): { token: string; session: Session } {
  pruneSessions(now);
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const iso = now.toISOString();
  const session: Session = {
    id: nextSessionId(),
    tokenHash: hashSessionToken(token),
    userId,
    createdAt: iso,
    lastSeenAt: iso,
    expiresAt: new Date(now.getTime() + absoluteTimeoutMs()).toISOString(),
  };
  store.sessions.push(session);
  return { token, session };
}

function removeSession(id: number) {
  store.sessions = store.sessions.filter((s) => s.id !== id);
}

/**
 * Looks up a live session for a raw cookie token and refreshes its idle
 * timer. Expired sessions, and sessions of deactivated users, are deleted and
 * yield null.
 */
export function resolveSession(token: string, now: Date = new Date()): { session: Session; user: User } | null {
  if (!token) return null;
  const tokenHash = hashSessionToken(token);
  const session = store.sessions.find((s) => s.tokenHash === tokenHash);
  if (!session) return null;
  if (isExpired(session, now.getTime())) {
    removeSession(session.id);
    return null;
  }
  const user = store.users.find((u) => u.id === session.userId);
  if (!user || !user.active) {
    removeSession(session.id);
    return null;
  }
  session.lastSeenAt = now.toISOString();
  return { session, user };
}

export function revokeSessionToken(token: string): boolean {
  const tokenHash = hashSessionToken(token);
  const before = store.sessions.length;
  store.sessions = store.sessions.filter((s) => s.tokenHash !== tokenHash);
  return store.sessions.length !== before;
}

export function revokeSessionsForUser(userId: number): number {
  const before = store.sessions.length;
  store.sessions = store.sessions.filter((s) => s.userId !== userId);
  return before - store.sessions.length;
}

// ── Cookies ─────────────────────────────────────────────────────────────────

/** Reads one cookie from the Cookie header without a dependency. */
export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    const value = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }
  return null;
}

export function sessionTokenFrom(req: Request): string | null {
  return readCookie(req.headers.cookie, SESSION_COOKIE_NAME);
}

/** Whether cookies for this request should carry the Secure attribute. */
export function cookieShouldBeSecure(req: Pick<Request, "secure">, cfg: AppConfig = config): boolean {
  if (cfg.sessionCookieSecure === "always") return true;
  if (cfg.sessionCookieSecure === "never") return false;
  return req.secure === true; // "auto": only when the request arrived over HTTPS
}

export function buildSessionCookie(token: string, opts: { secure: boolean; maxAgeSeconds: number }): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    `Path=${SESSION_COOKIE_PATH}`,
    `Max-Age=${opts.maxAgeSeconds}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}

export function buildClearedSessionCookie(opts: { secure: boolean }): string {
  return buildSessionCookie("", { secure: opts.secure, maxAgeSeconds: 0 });
}
