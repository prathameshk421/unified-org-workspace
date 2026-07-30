import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Unit tests manage env explicitly; avoid rehydrating from local .env.
if (!process.env.VITEST) {
  const envPath = resolve(import.meta.dirname, "../../../../.env");
  if (existsSync(envPath)) {
    config({ path: envPath, override: false });
  }
}
