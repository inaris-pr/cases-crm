import { describe, it, expect } from "vitest";
import {
  ConfigError,
  DEFAULT_API_HOST,
  DEFAULT_SESSION_ABSOLUTE_TIMEOUT_DAYS,
  DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES,
  loadConfig,
} from "../src/config";

/** Named, validated security settings (Phase 1). */
describe("configuration", () => {
  it("defaults to an 8-hour idle and 7-day absolute session, bound to 127.0.0.1", () => {
    const cfg = loadConfig({});

    expect(DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES).toBe(480);
    expect(DEFAULT_SESSION_ABSOLUTE_TIMEOUT_DAYS).toBe(7);
    expect(cfg.sessionIdleTimeoutMinutes).toBe(480);
    expect(cfg.sessionAbsoluteTimeoutDays).toBe(7);
    expect(cfg.apiHost).toBe(DEFAULT_API_HOST);
    expect(DEFAULT_API_HOST).toBe("127.0.0.1");
    expect(cfg.apiPort).toBe(3001);
    expect(cfg.sessionCookieSecure).toBe("auto");
    expect(cfg.corsAllowedOrigins).toEqual([]);
    expect(cfg.loginMaxFailuresPerAccount).toBe(5);
    expect(cfg.loginMaxFailuresPerIp).toBe(20);
    expect(cfg.loginThrottleWindowMinutes).toBe(15);
  });

  it("reads overrides from the environment", () => {
    const cfg = loadConfig({
      SESSION_IDLE_TIMEOUT_MINUTES: "60",
      SESSION_ABSOLUTE_TIMEOUT_DAYS: "2",
      API_HOST: "0.0.0.0",
      PORT: "4000",
      SESSION_COOKIE_SECURE: "always",
      CORS_ALLOWED_ORIGINS: "https://crm.example.com, http://localhost:4173",
    });

    expect(cfg).toMatchObject({
      sessionIdleTimeoutMinutes: 60,
      sessionAbsoluteTimeoutDays: 2,
      apiHost: "0.0.0.0",
      apiPort: 4000,
      sessionCookieSecure: "always",
      corsAllowedOrigins: ["https://crm.example.com", "http://localhost:4173"],
    });
  });

  it("rejects invalid values with a message naming the variable", () => {
    const bad: Record<string, string>[] = [
      { SESSION_IDLE_TIMEOUT_MINUTES: "eight hours" },
      { SESSION_IDLE_TIMEOUT_MINUTES: "-5" },
      { SESSION_IDLE_TIMEOUT_MINUTES: "1" }, // below the 5-minute floor
      { SESSION_ABSOLUTE_TIMEOUT_DAYS: "0" },
      { SESSION_ABSOLUTE_TIMEOUT_DAYS: "365" },
      { SESSION_IDLE_TIMEOUT_MINUTES: "2000", SESSION_ABSOLUTE_TIMEOUT_DAYS: "1" }, // idle > absolute
      { SESSION_COOKIE_SECURE: "sometimes" },
      { CORS_ALLOWED_ORIGINS: "crm.example.com" },
      { CORS_ALLOWED_ORIGINS: "https://crm.example.com/path" },
      { PORT: "70000" },
    ];
    for (const env of bad) {
      expect(() => loadConfig(env)).toThrow(ConfigError);
      try {
        loadConfig(env);
      } catch (err: any) {
        const named = Object.keys(env).some((k) => err.message.includes(k));
        expect(named).toBe(true);
      }
    }
  });
});
