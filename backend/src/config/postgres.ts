import { Pool } from "pg";

// Pool PostgreSQL dùng chung cho metadata, Material Directory, JSONB documents, logs và topology metrics.
export const pool = new Pool({
  host: process.env.POSTGRES_HOST ?? "localhost",
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  database: process.env.POSTGRES_DB ?? "supply_chain_map",
  user: process.env.POSTGRES_USER ?? "scm_user",
  password: process.env.POSTGRES_PASSWORD ?? "scm_password"
});
