import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(import.meta.dirname, "../../../../.env");
if (existsSync(envPath)) {
  config({ path: envPath, override: false });
}
