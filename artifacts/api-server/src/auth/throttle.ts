/**
 * In-memory login throttling.
 *
 * Failed attempts are counted per email and per client IP inside a sliding
 * window. Once either count reaches its limit, further attempts for that
 * email (or from that IP) are refused with 429 until the oldest failure ages
 * out of the window — even with the correct password, so the lock cannot be
 * used to confirm a guess. A successful login clears that email's failures.
 *
 * State is per process and resets on restart; that is acceptable for the
 * prototype (see the architecture plan §11B for production rate limiting).
 */
import { config } from "../config.js";

export interface LoginThrottleOptions {
  maxFailuresPerAccount: number;
  maxFailuresPerIp: number;
  windowMs: number;
  now?: () => number;
}

export type ThrottleDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export function createLoginThrottle(opts: LoginThrottleOptions) {
  const now = opts.now ?? (() => Date.now());
  const failures = new Map<string, number[]>();

  const accountKey = (email: string) => `account:${email.trim().toLowerCase()}`;
  const ipKey = (ip: string) => `ip:${ip}`;

  function recent(key: string): number[] {
    const cutoff = now() - opts.windowMs;
    const kept = (failures.get(key) ?? []).filter((t) => t > cutoff);
    if (kept.length) failures.set(key, kept);
    else failures.delete(key);
    return kept;
  }

  function blockedFor(key: string, max: number): number | null {
    const times = recent(key);
    if (times.length < max) return null;
    // Unblocked once enough of the oldest failures leave the window.
    const releaseAt = times[times.length - max] + opts.windowMs;
    return Math.max(1, Math.ceil((releaseAt - now()) / 1000));
  }

  return {
    check(email: string, ip: string): ThrottleDecision {
      const a = blockedFor(accountKey(email), opts.maxFailuresPerAccount);
      const b = blockedFor(ipKey(ip), opts.maxFailuresPerIp);
      const wait = Math.max(a ?? 0, b ?? 0);
      return wait > 0 ? { allowed: false, retryAfterSeconds: wait } : { allowed: true };
    },
    recordFailure(email: string, ip: string) {
      for (const key of [accountKey(email), ipKey(ip)]) {
        failures.set(key, [...recent(key), now()]);
      }
    },
    recordSuccess(email: string) {
      failures.delete(accountKey(email));
    },
    reset() {
      failures.clear();
    },
  };
}

export type LoginThrottle = ReturnType<typeof createLoginThrottle>;

export const loginThrottle: LoginThrottle = createLoginThrottle({
  maxFailuresPerAccount: config.loginMaxFailuresPerAccount,
  maxFailuresPerIp: config.loginMaxFailuresPerIp,
  windowMs: config.loginThrottleWindowMinutes * 60_000,
});
