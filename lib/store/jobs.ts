import "server-only"

import { randomUUID } from "node:crypto"

import { getDb, iso, isoOrUndefined, isUniqueViolation } from "@/lib/db"
import type { Dress, Job, StoredImage, Template } from "@/lib/types"

import { StoreError } from "./errors"
import { isUuid, slugify } from "./templates"

/** A running job older than this was killed by the function timeout (300s) and is failed. */
export const STALE_AFTER_SECONDS = 330

export const STALE_MESSAGE = "Timed out or interrupted — retry"

type Row = {
  id: string
  template_id: string
  template_snapshot: Job["templateSnapshot"]
  original_name: string
  source: StoredImage
  dress_id: string | null
  size: string | null
  status: Job["status"]
  error: string | null
  attempts: number
  created_at: unknown
  started_at: unknown
  finished_at: unknown
  dress_name: string | null
  dress_file_name: string | null
  dress_image: StoredImage | null
}

const SELECT = `
  SELECT j.*, d.name AS dress_name, d.file_name AS dress_file_name, d.image AS dress_image
  FROM jobs j LEFT JOIN dresses d ON d.id = j.dress_id`

function toJob(r: Row): Job {
  return {
    id: r.id,
    templateId: r.template_id,
    templateSnapshot: r.template_snapshot,
    originalName: r.original_name,
    source: r.source,
    dressId: r.dress_id ?? undefined,
    name: r.dress_name ?? undefined,
    fileName: r.dress_file_name ?? undefined,
    output: r.status === "done" ? (r.dress_image ?? undefined) : undefined,
    size: r.size ?? undefined,
    status: r.status,
    error: r.error ?? undefined,
    attempts: r.attempts,
    createdAt: iso(r.created_at),
    startedAt: isoOrUndefined(r.started_at),
    finishedAt: isoOrUndefined(r.finished_at),
  }
}

export async function listJobs(filter: { templateId?: string } = {}): Promise<Job[]> {
  if (filter.templateId && !isUuid(filter.templateId)) return []
  const rows = await getDb().query<Row>(
    `${SELECT} WHERE $1::uuid IS NULL OR j.template_id = $1 ORDER BY j.created_at DESC LIMIT 500`,
    [filter.templateId ?? null],
  )
  return rows.map(toJob)
}

export async function getJob(id: string): Promise<Job> {
  if (!isUuid(id)) throw new StoreError("not_found", "Job not found")
  const [row] = await getDb().query<Row>(`${SELECT} WHERE j.id = $1`, [id])
  if (!row) throw new StoreError("not_found", "Job not found")
  return toJob(row)
}

/** Build a queued job for a template from an image already on ImageKit. */
export function newJob(
  template: Template,
  input: { originalName: string; source: StoredImage; dressId?: string },
): Job {
  const { name, slug, prompt, model, quality, outputFormat, reference } = template
  return {
    id: randomUUID(),
    templateId: template.id,
    templateSnapshot: { name, slug, prompt, model, quality, outputFormat, reference },
    originalName: input.originalName,
    source: input.source,
    dressId: input.dressId,
    status: "queued",
    attempts: 0,
    createdAt: new Date().toISOString(),
  }
}

export async function addJobs(jobs: Job[]): Promise<void> {
  if (!jobs.length) return
  const params: unknown[] = []
  const values = jobs.map((j) => {
    const at = params.length
    params.push(
      j.id,
      j.templateId,
      JSON.stringify(j.templateSnapshot),
      j.originalName,
      JSON.stringify(j.source),
      j.dressId ?? null,
      j.createdAt,
    )
    const p = (n: number) => `$${at + n}`
    return `(${p(1)}, ${p(2)}, ${p(3)}, ${p(4)}, ${p(5)}, ${p(6)}, 'queued', ${p(7)})`
  })
  await getDb().query(
    `INSERT INTO jobs (id, template_id, template_snapshot, original_name, source, dress_id, status,
       created_at) VALUES ${values.join(", ")}`,
    params,
  )
}

/**
 * Atomically move the oldest queued job to processing, if fewer than `limit` are running.
 * The advisory lock serialises concurrent claims so two workers can't both take the last slot;
 * a worker that loses the race just gets nothing and exits.
 */
export async function claimNextJob(limit: number): Promise<Job | null> {
  const [claimed] = await getDb().query<{ id: string }>(
    `WITH lock AS (SELECT pg_try_advisory_xact_lock(424242) AS ok),
     next AS (
       SELECT j.id FROM jobs j, lock
       WHERE lock.ok AND j.status = 'queued'
         AND (SELECT count(*) FROM jobs WHERE status = 'processing') < $1
       ORDER BY j.created_at LIMIT 1
     )
     UPDATE jobs SET status = 'processing', started_at = now(), attempts = attempts + 1,
       error = NULL, finished_at = NULL
     FROM next WHERE jobs.id = next.id RETURNING jobs.id`,
    [limit],
  )
  return claimed ? getJob(claimed.id) : null
}

/** Fail jobs whose function was killed mid-run. Returns how many. */
export async function failStaleJobs(): Promise<number> {
  const rows = await getDb().query(
    `UPDATE jobs SET status = 'failed', error = $1, finished_at = now()
     WHERE status = 'processing' AND started_at < now() - make_interval(secs => $2)
     RETURNING id`,
    [STALE_MESSAGE, STALE_AFTER_SECONDS],
  )
  return rows.length
}

export async function hasQueuedJobs(): Promise<boolean> {
  const rows = await getDb().query("SELECT 1 FROM jobs WHERE status = 'queued' LIMIT 1")
  return rows.length > 0
}

export async function finishJob(
  id: string,
  result: { status: "done"; size: string } | { status: "failed"; error: string },
): Promise<void> {
  await getDb().query(
    `UPDATE jobs SET status = $2, size = COALESCE($3, size), error = $4, finished_at = now()
     WHERE id = $1`,
    [
      id,
      result.status,
      result.status === "done" ? result.size : null,
      result.status === "failed" ? result.error : null,
    ],
  )
}

export async function setJobDress(id: string, dressId: string): Promise<void> {
  await getDb().query("UPDATE jobs SET dress_id = $2 WHERE id = $1", [id, dressId])
}

/** Failed → queued again. */
export async function requeueJob(id: string): Promise<Job> {
  if (!isUuid(id)) throw new StoreError("not_found", "Job not found")
  const rows = await getDb().query(
    `UPDATE jobs SET status = 'queued', error = NULL, started_at = NULL, finished_at = NULL
     WHERE id = $1 AND status = 'failed' RETURNING id`,
    [id],
  )
  if (!rows.length) {
    await getJob(id) // 404 if missing
    throw new StoreError("invalid", "Only failed jobs can be retried")
  }
  return getJob(id)
}

// ---- Dresses -------------------------------------------------------------------------------

type DressRow = { id: string; name: string; file_name: string; image: StoredImage | null }

function toDress(r: DressRow): Dress {
  return { id: r.id, name: r.name, fileName: r.file_name, image: r.image ?? undefined }
}

export async function getDress(id: string): Promise<Dress> {
  const [row] = await getDb().query<DressRow>("SELECT * FROM dresses WHERE id = $1", [id])
  if (!row) throw new StoreError("not_found", "Dress not found")
  return toDress(row)
}

/** "Emerald Satin Wrap Dress" → "emerald-satin-wrap-dress", then "-2", "-3"… */
function* fileNames(name: string) {
  const base = slugify(name, "dress")
  yield base
  for (let n = 2; ; n++) yield `${base}-${n}`
}

/** Create a dress with a file name no other dress uses (the unique index settles races). */
export async function createDress(name: string): Promise<Dress> {
  for (const fileName of fileNames(name)) {
    const [row] = await getDb().query<DressRow>(
      `INSERT INTO dresses (id, name, file_name) VALUES ($1, $2, $3)
       ON CONFLICT (file_name) DO NOTHING RETURNING *`,
      [randomUUID(), name, fileName],
    )
    if (row) return toDress(row)
  }
  throw new Error("unreachable")
}

/**
 * The dress's file name for a new name: unchanged if it still slugifies to the same base,
 * otherwise the first free one. Doesn't write anything.
 */
export async function planDressFileName(dress: Dress, name: string): Promise<string> {
  const base = slugify(name, "dress")
  if (dress.fileName === base || dress.fileName.replace(/-\d+$/, "") === base) {
    return dress.fileName
  }
  const rows = await getDb().query<{ file_name: string }>(
    `SELECT file_name FROM dresses
     WHERE (file_name = $1 OR file_name LIKE $1 || '-%') AND id <> $2`,
    [base, dress.id],
  )
  const taken = new Set(rows.map((r) => r.file_name))
  for (const fileName of fileNames(name)) if (!taken.has(fileName)) return fileName
  throw new Error("unreachable")
}

export async function saveDress(
  id: string,
  patch: { name?: string; fileName?: string; image?: StoredImage },
): Promise<Dress> {
  try {
    const [row] = await getDb().query<DressRow>(
      `UPDATE dresses SET name = COALESCE($2, name), file_name = COALESCE($3, file_name),
         image = COALESCE($4, image)
       WHERE id = $1 RETURNING *`,
      [
        id,
        patch.name ?? null,
        patch.fileName ?? null,
        patch.image ? JSON.stringify(patch.image) : null,
      ],
    )
    if (!row) throw new StoreError("not_found", "Dress not found")
    return toDress(row)
  } catch (err) {
    if (isUniqueViolation(err)) throw new StoreError("conflict", "That file name was just taken")
    throw err
  }
}
