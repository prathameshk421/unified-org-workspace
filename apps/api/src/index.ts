import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import type { HealthCheckResponse } from "@unified/types";
import { env } from "./lib/env.js";
import { auditMutations } from "./middleware/audit-mutations.js";
import { identityRouter } from "./routes/identity/index.js";

const app = express();
const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);

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

app.listen(port, "0.0.0.0", () => {
  console.log(`API server listening on port ${port}`);
});
