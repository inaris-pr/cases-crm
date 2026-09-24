import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { createTestApp } from "./helpers/app";
import { createLoginThrottle, loginThrottle } from "../src/auth/throttle";

/** In-memory login throttling (Phase 1). */
describe("login throttle (unit, fake clock)", () => {
  function make(opts: Partial<{ perAccount: number; perIp: number; windowMs: number }> = {}) {
    let t = 1_000_000;
    const throttle = createLoginThrottle({
      maxFailuresPerAccount: opts.perAccount ?? 3,
      maxFailuresPerIp: opts.perIp ?? 10,
      windowMs: opts.windowMs ?? 60_000,
      now: () => t,
    });
    return { throttle, advance: (ms: number) => (t += ms) };
  }

  it("allows attempts until the account limit, then blocks with a retry time", () => {
    const { throttle } = make();
    for (let i = 0; i < 3; i++) {
      expect(throttle.check("a@example.com", "1.1.1.1").allowed).toBe(true);
      throttle.recordFailure("a@example.com", "1.1.1.1");
    }
    const d = throttle.check("a@example.com", "1.1.1.1");
    expect(d.allowed).toBe(false);
    expect(d.allowed === false && d.retryAfterSeconds).toBe(60);
  });

  it("treats the email case-insensitively", () => {
    const { throttle } = make();
    for (let i = 0; i < 3; i++) throttle.recordFailure("A@Example.com", "1.1.1.1");
    expect(throttle.check("a@example.com", "2.2.2.2").allowed).toBe(false);
  });

  it("unblocks once the failures age out of the window", () => {
    const { throttle, advance } = make();
    for (let i = 0; i < 3; i++) throttle.recordFailure("a@example.com", "1.1.1.1");
    advance(59_000);
    expect(throttle.check("a@example.com", "1.1.1.1").allowed).toBe(false);
    advance(1_001);
    expect(throttle.check("a@example.com", "1.1.1.1").allowed).toBe(true);
  });

  it("clears an account's failures on a successful login", () => {
    const { throttle } = make();
    throttle.recordFailure("a@example.com", "1.1.1.1");
    throttle.recordFailure("a@example.com", "1.1.1.1");
    throttle.recordSuccess("a@example.com");
    throttle.recordFailure("a@example.com", "1.1.1.1");
    throttle.recordFailure("a@example.com", "1.1.1.1");
    expect(throttle.check("a@example.com", "1.1.1.1").allowed).toBe(true);
  });

  it("keeps different accounts independent", () => {
    const { throttle } = make();
    for (let i = 0; i < 3; i++) throttle.recordFailure("a@example.com", "1.1.1.1");
    expect(throttle.check("b@example.com", "3.3.3.3").allowed).toBe(true);
  });

  it("limits one IP across many accounts", () => {
    const { throttle } = make({ perAccount: 100, perIp: 4 });
    for (let i = 0; i < 4; i++) throttle.recordFailure(`user${i}@example.com`, "9.9.9.9");
    expect(throttle.check("fresh@example.com", "9.9.9.9").allowed).toBe(false);
    expect(throttle.check("fresh@example.com", "8.8.8.8").allowed).toBe(true);
  });

  it("reset() forgets everything", () => {
    const { throttle } = make();
    for (let i = 0; i < 3; i++) throttle.recordFailure("a@example.com", "1.1.1.1");
    throttle.reset();
    expect(throttle.check("a@example.com", "1.1.1.1").allowed).toBe(true);
  });
});

describe("login throttle (through POST /api/auth/login)", () => {
  const app = createTestApp();
  afterAll(() => loginThrottle.reset());

  const login = (email: string, password: string) =>
    request(app).post("/api/auth/login").send({ email, password });

  it("locks an account after 5 bad passwords — even the right one is then refused", async () => {
    for (let i = 0; i < 5; i++) await login("leo@example.com", "wrong").expect(401);

    const res = await login("leo@example.com", "test123").expect(429);
    expect(res.body.error).toBe("too_many_attempts");
    expect(res.body.retryAfterSeconds).toBeGreaterThan(0);
    expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("does not lock other accounts", async () => {
    await login("grace@example.com", "test123").expect(200);
  });

  it("a successful login clears earlier failures for that account", async () => {
    for (let i = 0; i < 4; i++) await login("omar@example.com", "wrong").expect(401);
    await login("omar@example.com", "test123").expect(200);
    for (let i = 0; i < 4; i++) await login("omar@example.com", "wrong").expect(401);
    await login("omar@example.com", "test123").expect(200);
  });
});
