import "server-only"

import { randomUUID } from "node:crypto"

import { getDb, iso, isoOrUndefined, isUniqueViolation } from "@/lib/db"
import type { PlannedImage } from "@/lib/shoot"
import type { Batch, Job, PhotoView, Shoot, ShootImage, StoredImage, Template } from "@/lib/types"

import { StoreError } from "./errors"
import { newJob } from "./jobs"
import { isUuid, slugify } from "./templates"

type ShootRow = {
  id: string
  name: string
  handle: string
  description: string
  product_type: string | null
  tags: string[]
  product_id: string | null
  template_id: string | null
  created_at: unknown
}

/** Shoots with the product each was saved as. */
const SHOOTS = `SELECT s.*, p.id AS product_id FROM shoots s
  LEFT JOIN products p ON p.shoot_id = s.id`

type ImageRow = {
  id: string
  shoot_id: string
  color: string
  position: number
  view: PhotoView
  shot_name: string | null
  inputs: ShootImage["inputs"]
  output: StoredImage | null
  job_status: Job["status"] | null
  job_error: string | null
  job_started_at: unknown
}

/** The images of some shoots, with the status of their latest job. */
const IMAGES = `
  SELECT im.*, j.status AS job_status, j.error AS job_error, j.started_at AS job_started_at
  FROM shoot_images im
  LEFT JOIN LATERAL (
    SELECT status, error, started_at FROM jobs
    WHERE shoot_image_id = im.id ORDER BY created_at DESC LIMIT 1
  ) j ON true
  WHERE im.shoot_id = ANY($1::uuid[])
  ORDER BY im.position, im.shot_position`

function toShoot(row: ShootRow, images: ImageRow[]): Shoot {
  const colors: Shoot["colors"] = []
  for (const im of images) {
    const image: ShootImage = {
      id: im.id,
      color: im.color,
      view: im.view,
      shotName: im.shot_name ?? im.view,
      inputs: im.inputs,
      output: im.output ?? undefined,
      // Every image gets a job on insert; "queued" covers the instant before the first read.
      status: im.job_status ?? (im.output ? "done" : "queued"),
      error: im.job_error ?? undefined,
      startedAt: isoOrUndefined(im.job_started_at),
    }
    const color = colors.find((c) => c.name === im.color)
    if (color) color.images.push(image)
    else colors.push({ name: im.color, images: [image] })
  }
  const all = colors.flatMap((c) => c.images)
  return {
    id: row.id,
    name: row.name,
    handle: row.handle,
    description: row.description,
    productType: row.product_type ?? undefined,
    tags: row.tags,
    productId: row.product_id ?? undefined,
    templateId: row.template_id ?? undefined,
    createdAt: iso(row.created_at),
    colors,
    status: all.some((i) => i.status === "queued" || i.status === "processing")
      ? "generating"
      : all.some((i) => i.status === "failed")
        ? "attention"
        : "ready",
  }
}

export async function getShoot(id: string): Promise<Shoot> {
  if (!isUuid(id)) throw new StoreError("not_found", "Shoot not found")
  const [row] = await getDb().query<ShootRow>(`${SHOOTS} WHERE s.id = $1`, [id])
  if (!row) throw new StoreError("not_found", "Shoot not found")
  return toShoot(row, await getDb().query<ImageRow>(IMAGES, [[id]]))
}

export async function getBatch(id: string): Promise<Batch> {
  if (!isUuid(id)) throw new StoreError("not_found", "Batch not found")
  const rows = await getDb().query<ShootRow>(
    `${SHOOTS} WHERE s.batch_id = $1 ORDER BY s.batch_position`,
    [id],
  )
  if (!rows.length) throw new StoreError("not_found", "Batch not found")
  const images = await getDb().query<ImageRow>(IMAGES, [rows.map((r) => r.id)])
  const shoots = rows.map((row) =>
    toShoot(
      row,
      images.filter((im) => im.shoot_id === row.id),
    ),
  )
  return {
    id,
    shoots,
    status: shoots.some((s) => s.status === "generating")
      ? "generating"
      : shoots.some((s) => s.status === "attention")
        ? "attention"
        : "ready",
  }
}

export type NewShootInput = {
  name: string
  handle: string
  description: string
  productType?: string
  tags?: string[]
  images: PlannedImage<StoredImage>[]
}

/**
 * Save a batch (one set per product) and queue one edit per image, in one statement so a failure
 * can't leave it half-saved.
 */
export async function createBatch(inputs: NewShootInput[], template: Template): Promise<Batch> {
  const batchId = randomUUID()
  const shots = template.shots.map((s) => s.key)
  const shoots = inputs.map((input, i) => ({
    id: randomUUID(),
    name: input.name,
    handle: input.handle,
    description: input.description,
    product_type: input.productType || null,
    tags: input.tags ?? [],
    batch_position: i,
  }))
  const images = inputs.flatMap((input, i) => {
    const colors = [...new Set(input.images.map((im) => im.color))]
    return input.images.map((planned) => ({
      id: randomUUID(),
      shoot_id: shoots[i].id,
      color: planned.color,
      position: colors.indexOf(planned.color),
      view: planned.shot.key,
      shot_name: planned.shot.name,
      shot_position: shots.indexOf(planned.shot.key),
      inputs: planned.inputs,
    }))
  })
  const start = Date.now()
  const jobs = images.map((image, i) => {
    const first = image.inputs[0].image
    const job = newJob(template, {
      originalName: first.filePath.slice(first.filePath.lastIndexOf("/") + 1),
      source: first,
      shootImageId: image.id,
    })
    // Stagger so the queue (ordered by created_at) runs images in review order.
    job.createdAt = new Date(start + i).toISOString()
    return job
  })

  try {
    await getDb().query(
      `WITH s AS (
         INSERT INTO shoots (id, name, handle, description, product_type, tags, template_id,
           batch_id, batch_position)
         SELECT x.id, x.name, x.handle, x.description, x.product_type, x.tags, $1::uuid, $2::uuid,
           x.batch_position
         FROM jsonb_to_recordset($3::jsonb) AS x(id uuid, name text, handle text,
           description text, product_type text, tags text[], batch_position int)
         RETURNING id
       ), im AS (
         INSERT INTO shoot_images (id, shoot_id, color, position, view, shot_name,
           shot_position, inputs)
         SELECT x.id, x.shoot_id, x.color, x.position, x.view, x.shot_name,
           x.shot_position, x.inputs
         FROM jsonb_to_recordset($4::jsonb) AS x(id uuid, shoot_id uuid, color text, position int,
           view text, shot_name text, shot_position int, inputs jsonb)
         WHERE EXISTS (SELECT 1 FROM s)
         RETURNING id
       )
       INSERT INTO jobs (id, template_id, template_snapshot, original_name, source,
         shoot_image_id, status, created_at)
       SELECT x.id, x.template_id, x.template_snapshot, x.original_name, x.source,
         x.shoot_image_id, 'queued', x.created_at
       FROM jsonb_to_recordset($5::jsonb) AS x(id uuid, template_id uuid, template_snapshot jsonb,
         original_name text, source jsonb, shoot_image_id uuid, created_at timestamptz)
       WHERE EXISTS (SELECT 1 FROM im)`,
      [
        template.id,
        batchId,
        JSON.stringify(shoots),
        JSON.stringify(images),
        JSON.stringify(
          jobs.map((j) => ({
            id: j.id,
            template_id: j.templateId,
            template_snapshot: j.templateSnapshot,
            original_name: j.originalName,
            source: j.source,
            shoot_image_id: j.shootImageId,
            created_at: j.createdAt,
          })),
        ),
      ],
    )
  } catch (err) {
    if (isUniqueViolation(err)) throw new StoreError("conflict", "That name was just taken")
    throw err
  }
  return getBatch(batchId)
}

/** The shoot and image a job is for. */
export async function getShootImageContext(imageId: string) {
  const [row] = await getDb().query<{ shoot_id: string }>(
    "SELECT shoot_id FROM shoot_images WHERE id = $1",
    [imageId],
  )
  if (!row) throw new StoreError("not_found", "This image's shoot was deleted")
  const shoot = await getShoot(row.shoot_id)
  const image = shoot.colors.flatMap((c) => c.images).find((i) => i.id === imageId)!
  return { shoot, image }
}

export async function setShootImageOutput(imageId: string, output: StoredImage | null) {
  await getDb().query("UPDATE shoot_images SET output = $2 WHERE id = $1", [
    imageId,
    output ? JSON.stringify(output) : null,
  ])
}

/**
 * The first handle for each name that no shoot (nor an earlier name here) uses:
 * "satin-wrap-dress", then "-2", "-3"…
 */
export async function freeShootHandles(names: string[]): Promise<string[]> {
  const bases = names.map((name) => slugify(name, "shoot"))
  const rows = await getDb().query<{ handle: string }>(
    "SELECT handle FROM shoots WHERE handle = ANY($1::text[]) OR handle LIKE ANY($2::text[])",
    [bases, bases.map((b) => `${b}-%`)],
  )
  const taken = new Set(rows.map((r) => r.handle))
  return bases.map((base) => {
    let handle = base
    for (let n = 2; taken.has(handle); n++) handle = `${base}-${n}`
    taken.add(handle)
    return handle
  })
}
