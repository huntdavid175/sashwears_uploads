import "server-only"

import { randomUUID } from "node:crypto"

import { getDb, iso, isoOrUndefined } from "@/lib/db"
import type { Job, StoredImage, Template } from "@/lib/types"

import { StoreError } from "./errors"
import { isUuid } from "./templates"

/** A running job older than this was killed by the function timeout (300s) and is failed. */
export const STALE_AFTER_SECONDS = 330

export const STALE_MESSAGE = "Timed out or interrupted — regenerate to try again"

type Row = {
  id: string
  template_id: string
  template_snapshot: Job["templateSnapshot"]
  original_name: string
  source: StoredImage
  photo_id: string | null
  shoot_image_id: string | null
  size: string | null
  status: Job["status"]
  error: string | null
  attempts: number
  created_at: unknown
  started_at: unknown
  finished_at: unknown
}

function toJob(r: Row): Job {
  return {
    id: r.id,
    templateId: r.template_id,
    templateSnapshot: r.template_snapshot,
    originalName: r.original_name,
    source: r.source,
    photoId: r.photo_id ?? undefined,
    shootImageId: r.shoot_image_id ?? undefined,
    size: r.size ?? undefined,
    status: r.status,
    error: r.error ?? undefined,
    attempts: r.attempts,
    createdAt: iso(r.created_at),
    startedAt: isoOrUndefined(r.started_at),
    finishedAt: isoOrUndefined(r.finished_at),
  }
}

export async function getJob(id: string): Promise<Job> {
  if (!isUuid(id)) throw new StoreError("not_found", "Job not found")
  const [row] = await getDb().query<Row>("SELECT * FROM jobs WHERE id = $1", [id])
  if (!row) throw new StoreError("not_found", "Job not found")
  return toJob(row)
}

/** Build a queued job for a template from an image already on ImageKit. */
export function newJob(
  template: Template,
  input: { originalName: string; source: StoredImage; photoId?: string; shootImageId?: string },
): Job {
  const { name, slug, prompt, kind, model, quality, outputFormat, reference, shots } = template
  return {
    id: randomUUID(),
    templateId: template.id,
    templateSnapshot: { name, slug, prompt, kind, model, quality, outputFormat, reference, shots },
    originalName: input.originalName,
    source: input.source,
    photoId: input.photoId,
    shootImageId: input.shootImageId,
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
      j.photoId ?? null,
      j.shootImageId ?? null,
      j.createdAt,
    )
    const p = (n: number) => `$${at + n}`
    return `(${p(1)}, ${p(2)}, ${p(3)}, ${p(4)}, ${p(5)}, ${p(6)}, ${p(7)}, 'queued', ${p(8)})`
  })
  await getDb().query(
    `INSERT INTO jobs (id, template_id, template_snapshot, original_name, source, photo_id,
       shoot_image_id, status, created_at) VALUES ${values.join(", ")}`,
    params,
  )
}

/** The latest job for a shoot image. */
export async function latestShootJob(shootImageId: string): Promise<Job | null> {
  const [row] = await getDb().query<Row>(
    "SELECT * FROM jobs WHERE shoot_image_id = $1 ORDER BY created_at DESC LIMIT 1",
    [shootImageId],
  )
  return row ? toJob(row) : null
}

/** A fresh queued copy of `job`: same inputs, same template snapshot. */
export function againJob(job: Job): Job {
  return {
    ...job,
    id: randomUUID(),
    size: undefined,
    status: "queued",
    error: undefined,
    attempts: 0,
    createdAt: new Date().toISOString(),
    startedAt: undefined,
    finishedAt: undefined,
  }
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
