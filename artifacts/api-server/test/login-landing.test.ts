import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { createTestApp, loginAs } from "./helpers/app";
import {
  POST_LOGIN_PATH,
  SIGNED_OUT_PATH,
  beginSession,
  endSession,
  resumeSession,
  type SessionEffects,
} from "../../cases/src/lib/session";

/**
 * Where the browser lands when a session starts, resumes or ends
 * (artifacts/cases/src/lib/session.ts, wired up in lib/auth.tsx).
 *
 * Regression: the login screen rendered at whatever URL was open, so after
 * a sign-out from /leads the next sign-in — by the same or a DIFFERENT
 * employee — resumed on /leads. Every sign-in now lands on the Dashboard.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));

type Emp = { name: string };
type Perms = Record<string, unknown>;

/** A tiny stand-in for the browser tab: URL, query cache and auth state. */
function browserAt(initialPath: string) {
  const b = {
    location: initialPath,
    cache: new Map<string, unknown>(),
    user: null as Emp | null,
    permissions: {} as Perms,
    events: [] as string[],
    history: [initialPath] as string[],
  };
  const fx: SessionEffects<Emp, Perms> = {
    clearCache: () => {
      b.cache.clear();
      b.events.push("clearCache");
    },
    setUser: (u) => {
      b.user = u;
      b.events.push(`setUser:${u?.name ?? "null"}`);
    },
    setPermissions: (p) => {
      b.permissions = p;
      b.events.push("setPermissions");
    },
    replaceLocation: (p) => {
      b.location = p;
      b.history[b.history.length - 1] = p; // replace, not push
      b.events.push(`replace:${p}`);
    },
  };
  /** The employee clicks a link. */
  const visit = (p: string) => {
    b.location = p;
    b.history.push(p);
  };
  return { b, fx, visit };
}

const IRIS = { name: "Iris Burgos" };
const DEVON = { name: "Devon Park" };

describe("landing after sign-in", () => {
  it("the Dashboard is the post-login page", () => {
    expect(POST_LOGIN_PATH).toBe("/");
  });

  for (const page of ["/leads", "/records/accounts", "/records/cases", "/settings", "/cases/12", "/accounting"]) {
    it(`logout from ${page} → login → Dashboard`, () => {
      const { b, fx, visit } = browserAt("/");
      beginSession(fx, IRIS, { "leads.view": "all" });
      visit(page);
      expect(b.location).toBe(page);

      endSession(fx, {});
      expect(b.user).toBeNull();
      expect(b.location).toBe(SIGNED_OUT_PATH);

      beginSession(fx, IRIS, { "leads.view": "all" });
      expect(b.location).toBe("/");
    });
  }

  it("the same employee signing out and in again lands on the Dashboard", () => {
    const { b, fx, visit } = browserAt("/");
    beginSession(fx, DEVON, {});
    visit("/records/clients");
    endSession(fx, {});
    beginSession(fx, DEVON, {});
    expect(b.location).toBe("/");
    expect(b.user).toEqual(DEVON);
  });

  it("a different employee never inherits the previous employee's page", () => {
    const { b, fx, visit } = browserAt("/");
    beginSession(fx, IRIS, { "leads.view": "all" });
    visit("/leads");
    endSession(fx, {});
    beginSession(fx, DEVON, { "cases.view": "all" });
    expect(b.user).toEqual(DEVON);
    expect(b.location).toBe("/");
    expect(b.history).not.toContain("/leads"); // the signed-out entry was replaced
  });

  it("lands on the Dashboard even if the login screen was reached at a protected URL", () => {
    // e.g. the session expired on /settings, or a bookmark was opened signed out
    const { b, fx } = browserAt("/settings");
    beginSession(fx, DEVON, {});
    expect(b.location).toBe("/");
  });

  it("clears cached data and moves to the Dashboard before the new employee is set", () => {
    const { b, fx } = browserAt("/");
    beginSession(fx, IRIS, {});
    b.cache.set('["cases"]', ["Iris's case list"]);
    b.cache.set('["mentions"]', ["for Iris"]);
    b.events.length = 0;

    endSession(fx, {});
    expect(b.cache.size).toBe(0);

    b.cache.set('["stats"]', "fetched while signed out"); // anything stale
    beginSession(fx, DEVON, {});
    expect(b.cache.size).toBe(0);
    const i = (e: string) => b.events.lastIndexOf(e);
    expect(i("clearCache")).toBeLessThan(i("setUser:Devon Park"));
    expect(i("replace:/")).toBeLessThan(i("setUser:Devon Park"));
  });

  it("signing out forgets the employee and their permissions", () => {
    const { b, fx } = browserAt("/");
    beginSession(fx, IRIS, { "system.data.manage": true });
    endSession(fx, {});
    expect(b.user).toBeNull();
    expect(b.permissions).toEqual({});
  });
});

describe("reloading while signed in", () => {
  it("keeps the current page", () => {
    for (const page of ["/leads", "/records/cases", "/cases/3", "/settings"]) {
      const { b, fx } = browserAt(page);
      resumeSession(fx, IRIS, {});
      expect(b.location).toBe(page);
      expect(b.user).toEqual(IRIS);
      expect(b.events.some((e) => e.startsWith("replace:"))).toBe(false);
    }
  });
});

describe("the web app uses these rules", () => {
  const auth = fs.readFileSync(path.join(HERE, "../../cases/src/lib/auth.tsx"), "utf-8");
  const login = fs.readFileSync(path.join(HERE, "../../cases/src/pages/Login.tsx"), "utf-8");

  it("sign-in, reload and sign-out go through lib/session", () => {
    expect(auth).toMatch(/beginSession\(effects, user, permissions\)/);
    expect(auth).toMatch(/resumeSession\(effects, me\.user/);
    expect(auth).toMatch(/endSession\(effects, \{\}\)/);
    expect(auth).toMatch(/navigate\(path, \{ replace: true \}\)/);
    expect(auth).toMatch(/qc\.clear\(\)/);
  });

  it("the login page hands off to login() and picks no destination itself", () => {
    expect(login).toMatch(/await login\(user\)/);
    expect(login).not.toMatch(/navigate\(|setLocation|history\.|window\.location/);
  });

  it("nothing remembers a post-login destination", () => {
    for (const src of [auth, login]) {
      expect(src).not.toMatch(/returnTo|redirectTo|next=|sessionStorage/);
    }
  });
});

describe("sessions on the server across a sign-out and a different sign-in", () => {
  const app = createTestApp();

  it("logout destroys the session, and the next employee gets only their own", async () => {
    const iris = await loginAs("iris@example.com");
    await request(app).post("/api/auth/logout").set(iris).expect(204);
    expect((await request(app).get("/api/auth/me").set(iris)).status).toBe(401);

    const devon = await loginAs("devon@example.com");
    const me = await request(app).get("/api/auth/me").set(devon);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe("devon@example.com");
    expect(me.body.permissions["system.data.manage"]).toBeUndefined();
  });
});
