import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import type { HealthCheckResponse } from "@unified/types";
import { env } from "./lib/env.js";
import { auditMutations } from "./middleware/audit-mutations.js";
import { identityRouter } from "./routes/identity/index.js";
import { orgSettingsRouter } from "./routes/org-settings/index.js";
import { ticketsRouter } from "./routes/tickets/index.js";

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
  app.use(orgSettingsRouter);
  app.use(ticketsRouter);

  return app;
}
