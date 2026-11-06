// Shared Neon Postgres helper. Uses @neondatabase/serverless, the HTTP-based
// driver built for serverless functions (no connection pooling headaches).
//
// Needs one env var in Vercel: DATABASE_URL  (the Neon connection string,
// looks like postgres://user:pass@ep-xxxx.neon.tech/dbname?sslmode=require)

import { neon } from "@neondatabase/serverless";

let _sql = null;
function sql() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Add your Neon connection string as an env var in Vercel."
    );
  }
  if (!_sql) _sql = neon(process.env.DATABASE_URL);
  return _sql;
}

let schemaReady = null;

// Idempotent — safe to call on every request. Cached per warm lambda instance
// so it only actually hits the DB once per cold start.
export async function ensureSchema() {
  if (schemaReady) return schemaReady;
  const db = sql();
  schemaReady = (async () => {
    await db`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        active_app TEXT NOT NULL DEFAULT 'menu',
        active_app_ts BIGINT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await db`
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
  })();
  return schemaReady;
}

export function db() {
  return sql();
}
