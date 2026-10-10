import { readFile } from "node:fs/promises"
import path from "node:path"

import { PGlite } from "@electric-sql/pglite"

import { setDb } from "@/lib/db"
import type { StoredImage } from "@/lib/types"

/** Fresh in-memory Postgres with the real schema, wired in as the app's database. */
export async function useTestDb() {
  const pg = new PGlite()
  await pg.exec(await readFile(path.join(import.meta.dirname, "../db/schema.sql"), "utf8"))
  setDb({ query: async (text, params) => (await pg.query(text, params)).rows as never })
  return {
    pg,
    close: async () => {
      setDb(undefined)
      await pg.close()
    },
  }
}

let n = 0

/** A fake ImageKit file. */
export function storedImage(width = 1024, height = 1536, name = `photo-${++n}.png`): StoredImage {
  return {
    fileId: `file-${name}`,
    filePath: `/backdrop-studio/_sources/${name}`,
    url: `https://ik.imagekit.io/demo/backdrop-studio/_sources/${name}`,
    width,
    height,
    updatedAt: new Date().toISOString(),
  }
}
