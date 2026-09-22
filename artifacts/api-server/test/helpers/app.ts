import express from "express";
import cors from "cors";
import { registerRoutes } from "../../src/routes";

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

  app.use(cors());
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

/** The signed-in user the suite acts as. Matches a seeded admin. */
export const ME = "Iris Burgos";

/** Header the frontend's fetchJson() sends on every request. */
export const asMe = { "X-User": ME };
