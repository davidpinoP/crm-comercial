/**
 * Arnés de base de datos para pruebas: Postgres real en memoria (PGlite)
 * con un «auth» mínimo que imita a Supabase (auth.users, auth.uid(), roles).
 * Permite ejecutar las migraciones reales y verificar RLS y funciones SQL.
 */
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "supabase/migrations");

const AUTH_STUB = `
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;
`;

const GRANTS = `
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
`;

export async function createTestDb() {
  const db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(AUTH_STUB);
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }
  await db.exec(GRANTS);
  return db;
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>;

export async function createUser(db: TestDb, id: string, email = `${id}@test.local`) {
  await db.query("reset role");
  await db.query("insert into auth.users(id, email) values ($1, $2)", [id, email]);
}

/** Ejecuta fn como el usuario autenticado indicado (null = anónimo). */
export async function asUser<T>(db: TestDb, userId: string | null, fn: () => Promise<T>): Promise<T> {
  await db.query("reset role");
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId ?? ""]);
  await db.query(userId ? "set role authenticated" : "set role anon");
  try {
    return await fn();
  } finally {
    await db.query("reset role");
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  }
}
