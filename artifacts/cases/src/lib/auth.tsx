import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { API, UNAUTHENTICATED_EVENT, fetchJson } from "./api";
import type { EffectivePermissions, MeResponse, User } from "./api";
import { beginSession, endSession, resumeSession, type SessionEffects } from "./session";

interface AuthState {
  user: User | null;
  /**
   * Effective permissions from GET /api/auth/me. Held here for Phase 5
   * (navigation and gating); nothing reads them yet, and the API does not
   * enforce them until Phase 3.
   */
  permissions: EffectivePermissions;
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
  const [permissions, setPermissions] = useState<EffectivePermissions>({});
  const [loading, setLoading] = useState(true);
  const [, navigate] = useLocation();

  const effects = useMemo<SessionEffects<User, EffectivePermissions>>(
    () => ({
      clearCache: () => qc.clear(), // never show one employee's cached data to the next
      setUser,
      setPermissions,
      replaceLocation: (path) => navigate(path, { replace: true }),
    }),
    [qc, navigate],
  );

  const signedOut = useCallback(() => endSession(effects, {}), [effects]);

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
        resumeSession(effects, me.user, me.permissions ?? {});
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
      let permissions: EffectivePermissions = {};
      try {
        const me = await fetchJson<MeResponse>(API("/api/auth/me"));
        user = me.user;
        permissions = me.permissions ?? {};
      } catch {
        // Keep the employee from the login response; permissions stay empty.
      }
      beginSession(effects, user, permissions);
    },
    [effects],
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
    <AuthContext.Provider value={{ user, permissions, loading, login, logout }}>
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
