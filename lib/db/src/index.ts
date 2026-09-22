import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/cases";

// Use a single client across the process. Pooling for serverless can be added later.
const client = postgres(connectionString, { max: 10 });

export const db = drizzle(client, { schema, logger: false });

export type DB = typeof db;
export * from "./schema.js";
export { schema };
