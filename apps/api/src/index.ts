import cors from "cors";
import express from "express";
import helmet from "helmet";
import type { HealthCheckResponse } from "@unified/types";

const app = express();
const port = Number(process.env.API_PORT ?? 4000);

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  const payload: HealthCheckResponse = {
    status: "ok",
    service: "api",
    timestamp: new Date().toISOString(),
  };

  res.json(payload);
});

app.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`);
});
