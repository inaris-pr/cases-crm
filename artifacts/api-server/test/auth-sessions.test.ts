import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { createTestApp, loginAs, sessionCookieFrom, ME } from "./helpers/app";
import { store } from "../src/store";
import {
  SESSION_COOKIE_NAME,
  buildSessionCookie,
  cookieShouldBeSecure,
  hashSessionToken,
  revokeSessionsForUser,
} from "../src/auth/sessions";
import { requireSameOrigin } from "../src/auth/middleware";
import { config } from "../src/config";

/**
 * Phase 1 — identity foundation: server sessions, the authentication
 * requirement on every /api route, and identity that cannot be spoofed.
 * (Authorization by role is Phase 2/3 and is NOT tested here.)
 */
const app = createTestApp();
const HERE = path.dirname(fileURLToPath(import.meta.url));

const tokenOf = (cookie: string) => decodeURIComponent(cookie.slice(SESSION_COOKIE_NAME.length + 1));
const sessionFor = (cookie: string) =>
  store.sessions.find((s) => s.tokenHash === hashSessionToken(tokenOf(cookie)));
const userId = (email: string) => store.users.find((u) => u.email === email)!.id;

/**
 * Every route registered in src/routes.ts, read from the source so a route
 * added later is covered automatically. `:params` become 1.
 */
function registeredRoutes(): { method: string; path: string }[] {
  const src = fs.readFileSync(path.join(HERE, "../src/routes.ts"), "utf-8");
  const re = /\br\.(get|post|put|patch|delete)\(\s*"([^"]+)"/g;
  const out: { method: string; path: string }[] = [];
  for (const m of src.matchAll(re)) {
    out.push({ method: m[1], path: "/api" + m[2].replace(/:[A-Za-z]+/g, "1") });
  }
  return out;
}
const PUBLIC_ROUTES = new Set(["post /api/auth/login", "post /api/auth/logout"]);

describe("login", () => {
  it("sets an HttpOnly, SameSite=Lax session cookie scoped to /api", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "devon@example.com", password: "test123" })
      .expect(200);

    const raw = res.headers["set-cookie"] as unknown as string[];
    expect(raw).toHaveLength(1);
    const attrs = raw[0].split(";").map((a) => a.trim());
    expect(attrs[0]).toMatch(new RegExp(`^${SESSION_COOKIE_NAME}=[A-Za-z0-9_-]{40,}$`));
    expect(attrs).toContain("HttpOnly");
    expect(attrs).toContain("SameSite=Lax");
    expect(attrs).toContain("Path=/api");
    expect(attrs).toContain(`Max-Age=${config.sessionAbsoluteTimeoutDays * 24 * 60 * 60}`);
    // Plain-HTTP request with SESSION_COOKIE_SECURE=auto: not Secure.
    expect(attrs).not.toContain("Secure");
  });

  it("stores only a hash of the session token", async () => {
    const cookie = (await loginAs("sara@example.com")).Cookie;
    const token = tokenOf(cookie);
    const session = sessionFor(cookie)!;

    expect(session.userId).toBe(userId("sara@example.com"));
    expect(session.tokenHash).toBe(hashSessionToken(token));
    expect(JSON.stringify(store.sessions)).not.toContain(token);
  });

  it("records the login time", async () => {
    await loginAs("grace@example.com");
    const u = store.users.find((x) => x.email === "grace@example.com")!;
    expect(Date.now() - Date.parse(u.lastLoginAt!)).toBeLessThan(60_000);
  });

  it("rejects a wrong password and an unknown email without setting a cookie", async () => {
    for (const body of [
      { email: "devon@example.com", password: "nope" },
      { email: "ghost@example.com", password: "test123" },
    ]) {
      const res = await request(app).post("/api/auth/login").send(body).expect(401);
      expect(res.body.error).toBe("invalid_credentials");
      expect(res.headers["set-cookie"]).toBeUndefined();
    }
  });

  it("marks the cookie Secure when the request is HTTPS (or when forced)", () => {
    expect(cookieShouldBeSecure({ secure: true })).toBe(true);
    expect(cookieShouldBeSecure({ secure: false })).toBe(false);
    expect(cookieShouldBeSecure({ secure: false }, { ...config, sessionCookieSecure: "always" })).toBe(true);
    expect(cookieShouldBeSecure({ secure: true }, { ...config, sessionCookieSecure: "never" })).toBe(false);
    expect(buildSessionCookie("t", { secure: true, maxAgeSeconds: 5 })).toContain("; Secure");
  });
});

describe("GET /api/auth/me", () => {
  it("returns 401 without a session", async () => {
    const { body } = await request(app).get("/api/auth/me").expect(401);
    expect(body).toEqual({ error: "unauthenticated" });
  });

  it("returns the signed-in employee with roles and teams", async () => {
    const asNadia = await loginAs("nadia@example.com");
    const { body } = await request(app).get("/api/auth/me").set(asNadia).expect(200);

    expect(body.user).toMatchObject({
      name: "Nadia Flores",
      email: "nadia@example.com",
      roles: ["csr_supervisor"],
      departmentKey: "customer_service",
      active: true,
      demo: true,
    });
    expect(body.teams).toEqual([
      expect.objectContaining({ name: "Customer Service", relation: "supervisor" }),
    ]);

    const asDevon = await loginAs("devon@example.com");
    const devon = (await request(app).get("/api/auth/me").set(asDevon).expect(200)).body;
    expect(devon.user).toMatchObject({ name: "Devon Park", roles: ["csr"], demo: false });
    expect(devon.teams).toEqual([expect.objectContaining({ name: "Customer Service", relation: "member" })]);
  });
});

describe("every protected route requires a session", () => {
  const routes = registeredRoutes();

  it("finds the application's routes", () => {
    expect(routes.length).toBeGreaterThan(50);
  });

  it("answers 401 to each of them without a session", async () => {
    for (const { method, path: url } of routes) {
      if (PUBLIC_ROUTES.has(`${method} ${url}`)) continue;
      const pending = (request(app) as any)[method](url);
      const res = method === "get" ? await pending : await pending.send({});
      if (res.status !== 401) throw new Error(`${method.toUpperCase()} ${url} answered ${res.status} without a session`);
      expect(res.body).toEqual({ error: "unauthenticated" });
    }
  });

  it("answers 401 to an X-User header on its own", async () => {
    await request(app).get("/api/cases").set("X-User", ME).expect(401);
    await request(app).get("/api/auth/me").set("X-User", ME).expect(401);
    await request(app)
      .post("/api/cases")
      .set("X-User", ME)
      .send({ title: "Spoofed", accountId: 1 })
      .expect(401);
  });

  it("answers 401 to an unknown or garbled session cookie", async () => {
    for (const cookie of [`${SESSION_COOKIE_NAME}=not-a-real-token`, `${SESSION_COOKIE_NAME}=`, "other=1"]) {
      await request(app).get("/api/cases").set("Cookie", cookie).expect(401);
    }
  });
});

describe("logout and revocation", () => {
  it("logout ends the session and clears the cookie", async () => {
    const asSara = await loginAs("sara@example.com");
    await request(app).get("/api/auth/me").set(asSara).expect(200);

    const res = await request(app).post("/api/auth/logout").set(asSara).expect(204);
    const cleared = res.headers["set-cookie"][0];
    expect(cleared).toContain(`${SESSION_COOKIE_NAME}=;`);
    expect(cleared).toContain("Max-Age=0");
    expect(sessionFor(asSara.Cookie)).toBeUndefined();

    await request(app).get("/api/auth/me").set(asSara).expect(401);
  });

  it("logout without a session is harmless", async () => {
    await request(app).post("/api/auth/logout").expect(204);
  });

  it("a revoked session is refused", async () => {
    const asOmar = await loginAs("omar@example.com");
    await request(app).get("/api/cases").set(asOmar).expect(200);
    revokeSessionsForUser(userId("omar@example.com"));
    await request(app).get("/api/cases").set(asOmar).expect(401);
  });

  it("one employee's logout does not end another's session", async () => {
    const asLeo = await loginAs("leo@example.com");
    const asGrace = await loginAs("grace@example.com");
    await request(app).post("/api/auth/logout").set(asLeo).expect(204);
    await request(app).get("/api/auth/me").set(asGrace).expect(200);
  });
});

describe("session expiry", () => {
  const idleMs = config.sessionIdleTimeoutMinutes * 60_000;

  it("a request refreshes the idle timer", async () => {
    const asRachel = await loginAs("rachel@example.com");
    const s = sessionFor(asRachel.Cookie)!;
    s.lastSeenAt = new Date(Date.now() - idleMs + 60_000).toISOString(); // 1 min left
    await request(app).get("/api/auth/me").set(asRachel).expect(200);
    expect(Date.now() - Date.parse(s.lastSeenAt)).toBeLessThan(10_000);
  });

  it("expires after the idle limit", async () => {
    const asRachel = await loginAs("rachel@example.com");
    const s = sessionFor(asRachel.Cookie)!;
    s.lastSeenAt = new Date(Date.now() - idleMs - 1_000).toISOString();

    await request(app).get("/api/auth/me").set(asRachel).expect(401);
    expect(sessionFor(asRachel.Cookie)).toBeUndefined();
  });

  it("expires at the absolute limit even when active", async () => {
    const asRachel = await loginAs("rachel@example.com");
    const s = sessionFor(asRachel.Cookie)!;
    s.lastSeenAt = new Date().toISOString(); // active right now
    s.expiresAt = new Date(Date.now() - 1_000).toISOString();

    await request(app).get("/api/auth/me").set(asRachel).expect(401);
  });

  it("is created with the configured absolute lifetime", async () => {
    const s = sessionFor((await loginAs("rachel@example.com")).Cookie)!;
    const lifetime = Date.parse(s.expiresAt) - Date.parse(s.createdAt);
    expect(lifetime).toBe(config.sessionAbsoluteTimeoutDays * 24 * 60 * 60 * 1000);
  });
});

describe("inactive employees", () => {
  it("cannot sign in, and lose any session they had", async () => {
    const asTessa = await loginAs("tessa@example.com");
    const tessa = store.users.find((u) => u.email === "tessa@example.com")!;
    tessa.active = false;
    try {
      await request(app).get("/api/auth/me").set(asTessa).expect(401);
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "tessa@example.com", password: "test123" })
        .expect(403);
      expect(res.body.error).toBe("account_inactive");
      expect(res.headers["set-cookie"]).toBeUndefined();
    } finally {
      tessa.active = true;
    }
  });
});

describe("identity comes from the session, never the request", () => {
  it("ignores a spoofed X-User header alongside a real session", async () => {
    const asMe = await loginAs("iris@example.com");
    const { body } = await request(app)
      .post("/api/cases")
      .set(asMe)
      .set("X-User", "Devon Park")
      .send({ title: "Whose case?", accountId: 1 })
      .expect(201);
    expect(body.ownerName).toBe(ME);
  });

  it("ignores body author names on comments, calls, messages and mentions", async () => {
    const asMe = await loginAs("iris@example.com");

    const comment = (
      await request(app)
        .post("/api/cases/1/thread")
        .set(asMe)
        .send({ authorName: "Devon Park", body: "@Sara Mitchell spoof check" })
        .expect(201)
    ).body;
    expect(comment.authorName).toBe(ME);
    const mention = store.mentions.find((m) => m.threadEntryId === comment.id)!;
    expect(mention.fromName).toBe(ME);

    const call = (
      await request(app)
        .post("/api/cases/1/contacts")
        .set(asMe)
        .send({ direction: "outbound", channel: "phone", summary: "x", contact: "y", byName: "Devon Park" })
        .expect(201)
    ).body;
    expect(call.byName).toBe(ME);

    const convo = (
      await request(app)
        .post("/api/conversations")
        .set(asMe)
        .send({ type: "dm", members: [ME, "Devon Park"] })
        .expect(201)
    ).body;
    const msg = (
      await request(app)
        .post(`/api/conversations/${convo.id}/messages`)
        .set(asMe)
        .send({ senderName: "Devon Park", content: "not from Devon" })
        .expect(201)
    ).body;
    expect(msg.senderName).toBe(ME);
  });

  it("decides message deletion by the session's author, not a body field", async () => {
    const asMe = await loginAs("iris@example.com");
    const asDevon = await loginAs("devon@example.com");
    const convo = (
      await request(app).post("/api/conversations").set(asMe).send({ type: "dm", members: [ME, "Devon Park"] }).expect(201)
    ).body;
    const msg = (
      await request(app).post(`/api/conversations/${convo.id}/messages`).set(asMe).send({ content: "mine" }).expect(201)
    ).body;

    // Devon claims to be Iris in the body: still not the author.
    await request(app).delete(`/api/messages/${msg.id}`).set(asDevon).send({ senderName: ME }).expect(403);
    await request(app).delete(`/api/messages/${msg.id}`).set(asMe).expect(204);
  });
});

describe("secrets never leave the server", () => {
  const FORBIDDEN = [/passwordHash/, /"password"/, /scrypt\$/, /test123/];

  it("login and /auth/me return no password or hash", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "iris@example.com", password: "test123" })
      .expect(200);
    const me = await request(app).get("/api/auth/me").set("Cookie", sessionCookieFrom(login)).expect(200);
    for (const text of [login.text, me.text]) {
      for (const re of FORBIDDEN) expect(text).not.toMatch(re);
    }
  });

  it("no parameter-free GET endpoint returns one either", async () => {
    const asMe = await loginAs("iris@example.com");
    const gets = registeredRoutes().filter((r) => r.method === "get" && !r.path.includes("/1"));
    expect(gets.length).toBeGreaterThan(10);
    for (const { path: url } of gets) {
      const res = await request(app).get(url).set(asMe);
      for (const re of FORBIDDEN) {
        if (re.test(res.text)) throw new Error(`GET ${url} leaked ${re}`);
      }
    }
  });
});

describe("same-origin protection (CSRF)", () => {
  it("refuses a state-changing request from another origin", async () => {
    const asMe = await loginAs("iris@example.com");
    const { body } = await request(app)
      .post("/api/cases")
      .set(asMe)
      .set("Origin", "https://evil.example")
      .send({ title: "CSRF", accountId: 1 })
      .expect(403);
    expect(body.error).toBe("origin_not_allowed");
  });

  it("allows same-origin and header-less requests, and all reads", () => {
    const run = (method: string, headers: Record<string, string>) => {
      let status = 200;
      let passed = false;
      const res = { status: (s: number) => ((status = s), { json: () => undefined }) } as any;
      requireSameOrigin({ method, headers } as any, res, () => (passed = true));
      return passed ? "next" : status;
    };
    expect(run("POST", { host: "localhost:5173", origin: "http://localhost:5173" })).toBe("next");
    expect(run("PATCH", { host: "localhost:5173", referer: "http://localhost:5173/records/cases" })).toBe("next");
    expect(run("POST", { host: "localhost:5173" })).toBe("next");
    expect(run("GET", { host: "localhost:5173", origin: "https://evil.example" })).toBe("next");
    expect(run("POST", { host: "localhost:5173", origin: "https://evil.example" })).toBe(403);
    expect(run("DELETE", { host: "localhost:5173", origin: "http://localhost:5174" })).toBe(403);
    expect(run("POST", { host: "localhost:5173", origin: "null" })).toBe(403);
  });
});
