import express from "express";
import request from "supertest";
import { registerRoutes } from "../../src/routes";
import { applyCorsPolicy } from "../../src/security";
import { DEMO_PASSWORD } from "../../src/auth/identity";
import { SESSION_COOKIE_NAME } from "../../src/auth/sessions";

/**
 * Assembles the API the same way src/index.ts does, minus the pino-http
 * request logger (request logging is not under test, and its transport keeps
 * the test process alive) and minus app.listen() — supertest drives the app
 * object directly.
 *
 * The status codes and bodies produced by the error handler below are a
 * verbatim copy of the one in src/index.ts. If you change that handler, change
 * this one. (Extracting a shared createApp() from index.ts would remove the
 * duplication; that is a production refactor and has not been done.)
 */
export function createTestApp() {
  const app = express();

  applyCorsPolicy(app);
  app.use(express.json({ limit: "5mb" }));

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  registerRoutes(app);

  app.use(
    (
      err: any,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (res.headersSent) return;
      if (err?.issues) {
        res.status(400).json({ error: "validation_error", issues: err.issues });
        return;
      }
      res.status(err?.status || 500).json({ error: err?.message || "internal_error" });
    },
  );

  return app;
}

/** The signed-in user the suite acts as: Iris Burgos, the System Owner. */
export const ME = "Iris Burgos";
export const ME_EMAIL = "iris@example.com";

/** Pulls `cases_session=<token>` out of a response's Set-Cookie header(s). */
export function sessionCookieFrom(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers["set-cookie"];
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
  const cookie = list
    .map((c) => String(c).split(";")[0].trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`) && c.length > SESSION_COOKIE_NAME.length + 1);
  if (!cookie) throw new Error(`no ${SESSION_COOKIE_NAME} cookie in response`);
  return cookie;
}

/**
 * Signs in through the real endpoint (POST /api/auth/login) and returns the
 * header object carrying the resulting session cookie, for `.set(...)`.
 * Every test file gets a fresh store, so these are real sessions in it.
 */
export async function loginAs(email: string, password: string = DEMO_PASSWORD): Promise<{ Cookie: string }> {
  const res = await request(createTestApp()).post("/api/auth/login").send({ email, password });
  if (res.status !== 200) {
    throw new Error(`loginAs(${email}) failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { Cookie: sessionCookieFrom(res) };
}

/**
 * Headers for acting as ME. Previously this was an `X-User` header; identity
 * now comes only from a server session, so it is Iris's session cookie.
 */
export const asMe: { Cookie: string } = await loginAs(ME_EMAIL);

/**
 * supertest's request(app), but every request carries a session cookie
 * (ME's unless another is given). Test files that exercise features rather
 * than authentication import this in place of supertest, because every
 * /api route now requires a session.
 */
export function authedRequest(app: Parameters<typeof request>[0], headers: { Cookie: string } = asMe) {
  const r = request(app);
  return {
    get: (url: string) => r.get(url).set(headers),
    post: (url: string) => r.post(url).set(headers),
    put: (url: string) => r.put(url).set(headers),
    patch: (url: string) => r.patch(url).set(headers),
    delete: (url: string) => r.delete(url).set(headers),
  };
}
