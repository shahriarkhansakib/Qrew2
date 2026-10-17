import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

// Load .env.local and .env files (supporting apps/api, apps/web, and root paths)
const envCandidatePaths = [
  path.resolve(process.cwd(), ".env.local"),
  path.resolve(process.cwd(), ".env"),
  path.resolve(__dirname, "../.env.local"),
  path.resolve(__dirname, "../.env"),
  path.resolve(__dirname, "../../web/.env.local"),
  path.resolve(__dirname, "../../web/.env"),
  path.resolve(__dirname, "../../../.env.local"),
  path.resolve(__dirname, "../../../.env"),
];

for (const envPath of envCandidatePaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}
