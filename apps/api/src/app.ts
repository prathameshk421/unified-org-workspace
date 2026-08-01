import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import type { HealthCheckResponse } from "@unified/types";
import { env } from "./lib/env.js";
import { auditMutations } from "./middleware/audit-mutations.js";
import { auditRouter } from "./routes/audit/index.js";
import { connectionsRouter, platformConnectionsRouter } from "./routes/connections/index.js";
import { identityRouter } from "./routes/identity/index.js";
import { orgSettingsRouter } from "./routes/org-settings/index.js";
import { orgRouter, prsRouter } from "./routes/prs/index.js";
import { sharesRouter } from "./routes/shares/index.js";
import { ticketsRouter } from "./routes/tickets/index.js";
import { notificationsRouter } from "./routes/notifications/index.js";

export function createApp(): Express {
  const app = express();

  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true,
    }),
  );
  app.use(cookieParser());
  app.use(express.json());
  app.use(auditMutations);

  app.get("/health", (_req, res) => {
    const payload: HealthCheckResponse = {
      status: "ok",
      service: "api",
      timestamp: new Date().toISOString(),
    };

    res.json(payload);
  });

  app.use(identityRouter);
  app.use(connectionsRouter);
  app.use(platformConnectionsRouter);
  app.use(sharesRouter);
  app.use(prsRouter);
  app.use(orgRouter);
  app.use("/audit", auditRouter);
  app.use(orgSettingsRouter);
  app.use(ticketsRouter);
  app.use(notificationsRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found", code: "not_found" });
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof SyntaxError && "body" in error) {
      res.status(400).json({ error: "Malformed JSON body", code: "invalid_json" });
      return;
    }

    const httpError = error as { status?: unknown; statusCode?: unknown };
    const status =
      typeof httpError.status === "number"
        ? httpError.status
        : typeof httpError.statusCode === "number"
          ? httpError.statusCode
          : undefined;
    if (status !== undefined && status >= 400 && status < 500) {
      res.status(status).json({
        error: status === 413 ? "Payload too large" : "Invalid request",
        code: status === 413 ? "payload_too_large" : "invalid_request",
      });
      return;
    }

    res.status(500).json({ error: "Internal server error", code: "internal_error" });
  });

  return app;
}
