import nextEnv from "@next/env";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());
const url = process.env.DATABASE_MIGRATION_URL?.trim();
if (!url) throw new Error("DATABASE_MIGRATION_URL is required to run committed migrations.");
const pool = new Pool({ connectionString: url, max: 1 });
try {
  await migrate(drizzle({ client: pool }), { migrationsFolder: "drizzle" });
  const runtimeUrl = process.env.DATABASE_URL?.trim();
  if (runtimeUrl) {
    const runtimeRole = decodeURIComponent(new URL(runtimeUrl).username);
    if (!runtimeRole) throw new Error("DATABASE_URL must include the runtime role name.");
    const role = `"${runtimeRole.replaceAll('"', '""')}"`;
    await pool.query(`GRANT USAGE ON SCHEMA app TO ${role}`);
    await pool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO ${role}`);
    await pool.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO ${role}`);
    await pool.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${role}`);
    await pool.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT USAGE, SELECT ON SEQUENCES TO ${role}`);
  }
  console.log("Committed database migrations applied.");
} finally {
  await pool.end();
}
