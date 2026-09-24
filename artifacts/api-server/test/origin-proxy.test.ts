import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { createTestApp } from "./helpers/app";
import { createSameOriginGuard, allowedRequestOrigins } from "../src/auth/middleware";
import { config, loadConfig } from "../src/config";

/**
 * Regression for the Phase 1 browser-login failure.
 *
 * The browser loads the app from the Vite dev server (http://127.0.0.1:5173)
 * and calls /api there; Vite proxies to the API (http://127.0.0.1:3001). Vite's
 * proxy uses changeOrigin: true, which rewrites the Host header to
 * 127.0.0.1:3001 but leaves the browser's Origin (http://127.0.0.1:5173)
 * untouched, and adds no X-Forwarded-* headers. The first Phase 1 same-origin
 * check compared Origin with Host, so every browser login and write got
 * 403 origin_not_allowed. The API now also accepts an exact, configured list
 * of frontend origins (TRUSTED_FRONTEND_ORIGINS), and still trusts no
 * forwarded headers.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEV_ORIGIN = "http://127.0.0.1:5173";
const DEV_ORIGIN_LOCALHOST = "http://localhost:5173";
const EVIL = "https://evil.example";

// ── The guard on its own, with the headers Vite actually produces ───────────
describe("same-origin guard with the Vite proxy's headers", () => {
  const API_HOST_HEADER = "127.0.0.1:3001"; // what changeOrigin: true sends

  function run(guard: ReturnType<typeof createSameOriginGuard>, method: string, headers: Record<string, string>) {
    let status: number | null = null;
    let passed = false;
    const res = { status: (s: number) => ((status = s), { json: () => undefined }) } as any;
    guard({ method, headers } as any, res, () => (passed = true));
    return passed ? "next" : status;
  }
  const guard = createSameOriginGuard(config);

  it("accepts the dev server's origins even though Host is the API's", () => {
    expect(run(guard, "POST", { host: API_HOST_HEADER, origin: DEV_ORIGIN })).toBe("next");
    expect(run(guard, "POST", { host: API_HOST_HEADER, origin: DEV_ORIGIN_LOCALHOST })).toBe("next");
    expect(run(guard, "PATCH", { host: API_HOST_HEADER, referer: `${DEV_ORIGIN}/records/cases` })).toBe("next");
  });

  it("rejects anything that is not exactly a trusted origin", () => {
    for (const origin of [
      EVIL,
      "http://127.0.0.1:5174", // wrong port
      "https://127.0.0.1:5173", // wrong scheme
      "http://127.0.0.1.evil.example:5173",
      "http://localhost:5173.evil.example",
      "null",
    ]) {
      expect(run(guard, "POST", { host: API_HOST_HEADER, origin })).toBe(403);
    }
    expect(run(guard, "DELETE", { host: API_HOST_HEADER, referer: `${EVIL}/page` })).toBe(403);
  });

  it("ignores forwarded headers — forging them does not help", () => {
    expect(
      run(guard, "POST", {
        host: API_HOST_HEADER,
        origin: EVIL,
        "x-forwarded-host": "evil.example",
        "x-forwarded-proto": "https",
      }),
    ).toBe(403);
    // …and a trusted origin does not need them.
    expect(run(guard, "POST", { host: API_HOST_HEADER, origin: DEV_ORIGIN, "x-forwarded-host": "evil.example" })).toBe(
      "next",
    );
  });

  it("uses the configured origins: custom dev origin in, defaults out", () => {
    const custom = loadConfig({ TRUSTED_FRONTEND_ORIGINS: "http://127.0.0.1:4000" });
    const customGuard = createSameOriginGuard(custom);
    expect(allowedRequestOrigins(custom).has("http://127.0.0.1:4000")).toBe(true);
    expect(run(customGuard, "POST", { host: API_HOST_HEADER, origin: "http://127.0.0.1:4000" })).toBe("next");
    expect(run(customGuard, "POST", { host: API_HOST_HEADER, origin: DEV_ORIGIN })).toBe(403);

    // TRUSTED_FRONTEND_ORIGINS="" trusts no proxy origin; direct same-origin still works.
    const none = createSameOriginGuard(loadConfig({ TRUSTED_FRONTEND_ORIGINS: "" }));
    expect(run(none, "POST", { host: API_HOST_HEADER, origin: DEV_ORIGIN })).toBe(403);
    expect(run(none, "POST", { host: API_HOST_HEADER, origin: "http://127.0.0.1:3001" })).toBe("next");
  });

  it("still accepts CORS_ALLOWED_ORIGINS entries", () => {
    const withCors = createSameOriginGuard(loadConfig({ CORS_ALLOWED_ORIGINS: "https://crm.example.com" }));
    expect(run(withCors, "POST", { host: API_HOST_HEADER, origin: "https://crm.example.com" })).toBe("next");
    expect(run(withCors, "POST", { host: API_HOST_HEADER, origin: EVIL })).toBe(403);
  });
});

// ── End to end through a proxy that behaves like Vite's ─────────────────────
/**
 * Forwards every request to the API exactly as Vite 5's /api proxy does
 * (http-proxy with changeOrigin: true): same method, path, headers and body,
 * Host rewritten to the target, Origin untouched, no X-Forwarded-* added.
 */
function viteLikeProxy(apiPort: number): http.Server {
  return http.createServer((req, res) => {
    const upstream = http.request(
      {
        host: "127.0.0.1",
        port: apiPort,
        method: req.method,
        path: req.url,
        headers: { ...req.headers, host: `127.0.0.1:${apiPort}` },
      },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      },
    );
    upstream.on("error", () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
  });
}

const listen = (server: http.Server) =>
  new Promise<number>((resolve) => server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port)));

describe("through a Vite-style proxy (the browser's path)", () => {
  let api: http.Server;
  let proxy: http.Server;
  let base: string;

  beforeAll(async () => {
    api = http.createServer(createTestApp());
    const apiPort = await listen(api);
    proxy = viteLikeProxy(apiPort);
    base = `http://127.0.0.1:${await listen(proxy)}`;
  });
  afterAll(() => {
    proxy.close();
    api.close();
  });

  const call = (method: string, url: string, headers: Record<string, string> = {}, body?: unknown) =>
    fetch(base + url, {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  async function loginVia(origin: string, email = "iris@example.com") {
    const res = await call("POST", "/api/auth/login", { Origin: origin }, { email, password: "test123" });
    const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).find((c) => c.startsWith("cases_session="));
    return { res, cookie };
  }

  it("the proxy here mirrors the app's Vite config", () => {
    const vite = fs.readFileSync(path.join(HERE, "../../cases/vite.config.ts"), "utf-8");
    expect(vite).toMatch(/"\/api":\s*\{\s*target:\s*API_TARGET,\s*changeOrigin:\s*true\s*\}/);
    expect(vite).not.toMatch(/xfwd/);
  });

  it("logs in from http://127.0.0.1:5173", async () => {
    const { res, cookie } = await loginVia(DEV_ORIGIN);
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).roles).toEqual(["system_owner"]);
    expect(cookie).toBeTruthy();
  });

  it("logs in from http://localhost:5173", async () => {
    const { res, cookie } = await loginVia(DEV_ORIGIN_LOCALHOST, "devon@example.com");
    expect(res.status).toBe(200);
    expect(cookie).toBeTruthy();
  });

  it("performs an authenticated write from the dev origin", async () => {
    const { cookie } = await loginVia(DEV_ORIGIN);
    const me = await call("GET", "/api/auth/me", { Cookie: cookie! });
    expect(me.status).toBe(200);

    const created = await call("POST", "/api/cases", { Origin: DEV_ORIGIN, Cookie: cookie! }, {
      title: "Created through the dev proxy",
      accountId: 1,
    });
    expect(created.status).toBe(201);
    expect(((await created.json()) as any).ownerName).toBe("Iris Burgos");

    const logout = await call("POST", "/api/auth/logout", { Origin: DEV_ORIGIN, Cookie: cookie! });
    expect(logout.status).toBe(204);
    expect((await call("GET", "/api/auth/me", { Cookie: cookie! })).status).toBe(401);
  });

  it("rejects a foreign origin — login and writes — even with a valid session", async () => {
    const login = await call("POST", "/api/auth/login", { Origin: EVIL }, { email: "iris@example.com", password: "test123" });
    expect(login.status).toBe(403);
    expect(await login.json()).toEqual({ error: "origin_not_allowed" });
    expect(login.headers.getSetCookie()).toEqual([]);

    const { cookie } = await loginVia(DEV_ORIGIN);
    const write = await call("POST", "/api/cases", { Origin: EVIL, Cookie: cookie! }, { title: "CSRF", accountId: 1 });
    expect(write.status).toBe(403);

    const forged = await call(
      "POST",
      "/api/cases",
      { Origin: EVIL, Cookie: cookie!, "X-Forwarded-Host": "127.0.0.1:5173", "X-Forwarded-Proto": "http" },
      { title: "CSRF", accountId: 1 },
    );
    expect(forged.status).toBe(403);
  });

  it("still requires a session: 401 without one, and X-User does not authenticate", async () => {
    expect((await call("GET", "/api/cases")).status).toBe(401);
    expect((await call("POST", "/api/cases", { Origin: DEV_ORIGIN }, { title: "x", accountId: 1 })).status).toBe(401);
    expect((await call("GET", "/api/cases", { "X-User": "Iris Burgos" })).status).toBe(401);
    expect(
      (await call("POST", "/api/cases", { Origin: DEV_ORIGIN, "X-User": "Iris Burgos" }, { title: "x", accountId: 1 }))
        .status,
    ).toBe(401);
  });
});
