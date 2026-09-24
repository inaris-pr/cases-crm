import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { API, UNAUTHENTICATED_EVENT, fetchJson } from "./api";
import type { EffectivePermissions, MeResponse, User } from "./api";
import type { AccessContext } from "@cases/access";
import { beginSession, endSession, resumeSession, type SessionEffects } from "./session";

interface AuthState {
  user: User | null;
  /**
   * Effective permissions from GET /api/auth/me — what the sidebar, route
   * guard and controls are built from (the API enforces the same rules).
   */
  permissions: EffectivePermissions;
  /** The employee's access context for record-level controls (null when signed out). */
  access: AccessContext | null;
  loading: boolean;
  /**
   * Called by the login page after POST /api/auth/login succeeded. Loads the
   * employee and permissions, clears cached data and lands on the Dashboard.
   */
  login: (user: User) => Promise<void>;
  /** Ends the server session, then returns to the login screen. */
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** What a session is allowed to do, as reported by GET /api/auth/me. */
interface AccessGrant {
  permissions: EffectivePermissions;
  supervisedUserIds: number[];
}
/** Signed out, or /auth/me unavailable: nothing is shown. */
const NO_ACCESS: AccessGrant = { permissions: {}, supervisedUserIds: [] };

function grantFrom(me: MeResponse): AccessGrant {
  return { permissions: me.permissions ?? {}, supervisedUserIds: me.supervisedUserIds ?? [] };
}

/** Where the pre-Phase-1 client kept the signed-in user. No longer used. */
const LEGACY_STORAGE_KEY = "cases.auth.user";

/**
 * Authentication state backed by the server session.
 *
 * The session lives in an HttpOnly cookie the browser sends automatically;
 * this provider only mirrors who that session belongs to, asked from
 * GET /api/auth/me. Any 401 from the API (expired or revoked session) drops
 * the user back to the login screen.
 *
 * Landing rules (lib/session.ts): every sign-in lands on the Dashboard;
 * sign-out leaves the protected URL; a reload keeps the current page.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [grant, setGrant] = useState<AccessGrant>(NO_ACCESS);
  const [loading, setLoading] = useState(true);
  const [, navigate] = useLocation();

  const effects = useMemo<SessionEffects<User, AccessGrant>>(
    () => ({
      clearCache: () => qc.clear(), // never show one employee's cached data to the next
      setUser,
      setPermissions: setGrant,
      replaceLocation: (path) => navigate(path, { replace: true }),
    }),
    [qc, navigate],
  );

  const signedOut = useCallback(() => endSession(effects, NO_ACCESS), [effects]);

  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // storage unavailable — nothing to clean up
    }
    let cancelled = false;
    fetchJson<MeResponse>(API("/api/auth/me"))
      .then((me) => {
        if (cancelled) return;
        // A reload with a live session: stay on the current page.
        resumeSession(effects, me.user, grantFrom(me));
      })
      .catch(() => !cancelled && setUser(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // Runs once per page load; `effects` is stable for the provider's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    window.addEventListener(UNAUTHENTICATED_EVENT, signedOut);
    return () => window.removeEventListener(UNAUTHENTICATED_EVENT, signedOut);
  }, [signedOut]);

  const login = useCallback(
    async (fromLogin: User) => {
      // The new session's employee and permissions, as the server sees them.
      let user = fromLogin;
      let permissions: AccessGrant = NO_ACCESS;
      try {
        const me = await fetchJson<MeResponse>(API("/api/auth/me"));
        user = me.user;
        permissions = grantFrom(me);
      } catch {
        // Keep the employee from the login response; permissions stay empty.
      }
      beginSession(effects, user, permissions);
    },
    [effects],
  );

  const access = useMemo<AccessContext | null>(
    () => (user ? { userId: user.id, permissions: grant.permissions, supervisedUserIds: grant.supervisedUserIds } : null),
    [user, grant],
  );

  const logout = useCallback(async () => {
    try {
      await fetchJson(API("/api/auth/logout"), { method: "POST" });
    } catch {
      // Even if the request fails, forget the user locally.
    }
    signedOut();
  }, [signedOut]);

  return (
    <AuthContext.Provider value={{ user, permissions: grant.permissions, access, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/** Convenience: the signed-in user's name, or "?" if somehow rendered logged out. */
export function useMyName(): string {
  const { user } = useAuth();
  return user?.name ?? "?";
}
