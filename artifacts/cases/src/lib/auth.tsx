import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { API, UNAUTHENTICATED_EVENT, fetchJson } from "./api";
import type { MeResponse, User } from "./api";

interface AuthState {
  user: User | null;
  loading: boolean;
  /** Called by the login page after POST /api/auth/login succeeded. */
  login: (user: User) => void;
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
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const signedOut = useCallback(() => {
    setUser(null);
    qc.clear(); // never show one employee's cached data to the next
  }, [qc]);

  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // storage unavailable — nothing to clean up
    }
    let cancelled = false;
    fetchJson<MeResponse>(API("/api/auth/me"))
      .then((me) => !cancelled && setUser(me.user))
      .catch(() => !cancelled && setUser(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    window.addEventListener(UNAUTHENTICATED_EVENT, signedOut);
    return () => window.removeEventListener(UNAUTHENTICATED_EVENT, signedOut);
  }, [signedOut]);

  const login = useCallback((next: User) => setUser(next), []);

  const logout = useCallback(async () => {
    try {
      await fetchJson(API("/api/auth/logout"), { method: "POST" });
    } catch {
      // Even if the request fails, forget the user locally.
    }
    signedOut();
  }, [signedOut]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
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
