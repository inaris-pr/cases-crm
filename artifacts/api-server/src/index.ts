import "dotenv/config";
import express from "express";
import pinoHttp from "pino-http";
import { logger } from "./logger.js";
import { registerRoutes } from "./routes.js";
import { applyCorsPolicy } from "./security.js";
import { config } from "./config.js";

const app = express();

applyCorsPolicy(app);
app.use(express.json({ limit: "5mb" }));
app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/healthz" } }));

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

registerRoutes(app);

// Global error handler — must be last.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, "request_failed");
  if (res.headersSent) return;
  if (err?.issues) {
    res.status(400).json({ error: "validation_error", issues: err.issues });
    return;
  }
  res.status(err?.status || 500).json({ error: err?.message || "internal_error" });
});

// Bound to 127.0.0.1 by default so the API is not reachable from the local
// network; set API_HOST (e.g. 0.0.0.0) to change that deliberately.
app.listen(config.apiPort, config.apiHost, () => {
  logger.info(`✓ Cases API listening on http://${config.apiHost}:${config.apiPort}`);
});
