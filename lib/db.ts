import "server-only"

import { neon } from "@neondatabase/serverless"

/** The one thing the stores need: run a parameterised statement, get rows back. */
export type Db = {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>
}

let db: Db | undefined

export function getDb(): Db {
  if (db) return db
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error("DATABASE_URL is not set. Add your Neon connection string to .env.local.")
  }
  const sql = neon(url)
  db = { query: (text, params = []) => sql.query(text, params) as never }
  return db
}

/** Tests swap in PGlite. */
export function setDb(next: Db | undefined) {
  db = next
}

/** Postgres unique-violation, e.g. a template name or dress file name that's taken. */
export function isUniqueViolation(err: unknown, constraint?: string) {
  const e = err as { code?: string; constraint?: string }
  return e?.code === "23505" && (!constraint || e.constraint === constraint)
}

export function iso(value: unknown): string {
  return new Date(value as string).toISOString()
}

export function isoOrUndefined(value: unknown): string | undefined {
  return value == null ? undefined : iso(value)
}
