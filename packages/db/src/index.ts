import * as schema from "./schema";

// ---------------------------------------------------------------
// Environment guard
// ---------------------------------------------------------------

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set.");
}

const DATABASE_URL = process.env.DATABASE_URL;
const isProd = process.env.NODE_ENV === "production";

// ---------------------------------------------------------------
// Environment-aware database client
// ---------------------------------------------------------------

import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";

function createDb() {
  if (isProd) {
    const { neon } = require("@neondatabase/serverless");
    const sql = neon(DATABASE_URL);
    return drizzleNeon(sql, { schema });
  }

  const postgres = require("postgres");
  const client = postgres(DATABASE_URL);
  return drizzlePostgres(client, { schema });
}

export const db = createDb();

export * from "./formula-codec";
export * from "./org-initializer";
// ---------------------------------------------------------------
// Schema re-exports
// ---------------------------------------------------------------
export * from "./schema";
export * from "./seed-agency-templates";
