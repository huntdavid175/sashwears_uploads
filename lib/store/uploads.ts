import "server-only"

import { randomUUID } from "node:crypto"

import { getDb, iso, isoOrUndefined } from "@/lib/db"
import type { StoredImage, Upload } from "@/lib/types"

import { StoreError } from "./errors"
import { isUuid } from "./templates"

type Row = {
  id: string
  batch_id: string
  note: string | null
  original_name: string
  image: StoredImage
  size_bytes: string | number | null
  created_at: unknown
  downloaded_at: unknown
}

function toUpload(r: Row): Upload {
  return {
    id: r.id,
    batchId: r.batch_id,
    note: r.note ?? undefined,
    originalName: r.original_name,
    image: r.image,
    sizeBytes: r.size_bytes == null ? undefined : Number(r.size_bytes),
    createdAt: iso(r.created_at),
    downloadedAt: isoOrUndefined(r.downloaded_at),
  }
}

export async function listUploads(): Promise<Upload[]> {
  const rows = await getDb().query<Row>("SELECT * FROM uploads ORDER BY created_at DESC LIMIT 1000")
  return rows.map(toUpload)
}

/** One batch: photos uploaded together, sharing an optional note. */
export async function addUploads(
  note: string | undefined,
  files: { originalName: string; image: StoredImage; sizeBytes?: number }[],
): Promise<Upload[]> {
  if (!files.length) return []
  const batchId = randomUUID()
  const params: unknown[] = []
  const values = files.map((f) => {
    const at = params.length
    params.push(randomUUID(), batchId, note ?? null, f.originalName, JSON.stringify(f.image))
    params.push(f.sizeBytes ?? null)
    const p = (n: number) => `$${at + n}`
    return `(${p(1)}, ${p(2)}, ${p(3)}, ${p(4)}, ${p(5)}, ${p(6)})`
  })
  const rows = await getDb().query<Row>(
    `INSERT INTO uploads (id, batch_id, note, original_name, image, size_bytes)
     VALUES ${values.join(", ")} RETURNING *`,
    params,
  )
  return rows.map(toUpload)
}

export async function markDownloaded(ids: string[]): Promise<void> {
  const valid = ids.filter(isUuid)
  if (!valid.length) return
  await getDb().query(
    "UPDATE uploads SET downloaded_at = now() WHERE id = ANY($1::uuid[]) AND downloaded_at IS NULL",
    [valid],
  )
}

/** Removes the row and returns it, so the caller can delete the ImageKit file. */
export async function deleteUpload(id: string): Promise<Upload> {
  if (!isUuid(id)) throw new StoreError("not_found", "Upload not found")
  const [row] = await getDb().query<Row>("DELETE FROM uploads WHERE id = $1 RETURNING *", [id])
  if (!row) throw new StoreError("not_found", "Upload not found")
  return toUpload(row)
}
