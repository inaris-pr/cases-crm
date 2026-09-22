import "dotenv/config";
import express from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { logger } from "./logger.js";
import { registerRoutes } from "./routes.js";

const app = express();

app.use(cors());
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

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  logger.info(`✓ Cases API listening on http://localhost:${port}`);
});
