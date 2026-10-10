// Usage: node --env-file=.env.local scripts/migrate.mjs
import { readFile } from "node:fs/promises"

import { neon } from "@neondatabase/serverless"

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set")
  process.exit(1)
}
const sql = neon(process.env.DATABASE_URL)
const schema = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8")
const statements = schema
  .split(/;\s*$/m)
  .map((s) => s.replace(/^--.*$/gm, "").trim())
  .filter(Boolean)
for (const statement of statements) await sql.query(statement)
console.log(`Applied ${statements.length} statements`)
