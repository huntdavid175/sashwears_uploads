import "server-only"

import { randomUUID } from "node:crypto"

import { getDb, iso, isoOrUndefined, isUniqueViolation } from "@/lib/db"
import type {
  Job,
  PhotoView,
  Product,
  ProductColor,
  ProductPhoto,
  ProductStatus,
  StoredImage,
  Template,
} from "@/lib/types"

import { StoreError } from "./errors"
import { newJob } from "./jobs"
import { isUuid, slugify } from "./templates"

type ProductRow = {
  id: string
  kind: Product["kind"]
  name: string | null
  handle: string | null
  price: string | number
  sizes: string[]
  note: string | null
  template_id: string | null
  exported_at: unknown
  created_at: unknown
  updated_at: unknown
}

type ColorRow = {
  id: string
  product_id: string
  name: string
  position: number
  quantities: Record<string, number>
}

type PhotoRow = {
  id: string
  product_id: string
  color_id: string
  view: PhotoView
  source: StoredImage
  output: StoredImage | null
  job_status: Job["status"] | null
  job_error: string | null
  job_started_at: unknown
}

/** Photos with the status of their latest job. */
const PHOTOS = `
  SELECT ph.*, j.status AS job_status, j.error AS job_error, j.started_at AS job_started_at
  FROM product_photos ph
  LEFT JOIN LATERAL (
    SELECT status, error, started_at FROM jobs
    WHERE photo_id = ph.id ORDER BY created_at DESC LIMIT 1
  ) j ON true
  WHERE ph.product_id = ANY($1::uuid[])`

async function assemble(rows: ProductRow[]): Promise<Product[]> {
  if (!rows.length) return []
  const ids = rows.map((r) => r.id)
  const [colors, photos] = await Promise.all([
    getDb().query<ColorRow>(
      "SELECT * FROM product_colors WHERE product_id = ANY($1::uuid[]) ORDER BY position",
      [ids],
    ),
    getDb().query<PhotoRow>(PHOTOS, [ids]),
  ])
  return rows.map((r) => {
    const productColors: ProductColor[] = colors
      .filter((c) => c.product_id === r.id)
      .map((c) => ({
        id: c.id,
        name: c.name,
        position: c.position,
        quantities: c.quantities,
        photos: photos
          .filter((p) => p.color_id === c.id)
          .sort((a, b) => (a.view === b.view ? 0 : a.view === "front" ? -1 : 1))
          .map(toPhoto),
      }))
    return {
      id: r.id,
      kind: r.kind,
      name: r.name ?? undefined,
      handle: r.handle ?? undefined,
      price: Number(r.price),
      sizes: r.sizes,
      note: r.note ?? undefined,
      templateId: r.template_id ?? undefined,
      exportedAt: isoOrUndefined(r.exported_at),
      createdAt: iso(r.created_at),
      updatedAt: iso(r.updated_at),
      colors: productColors,
      status: statusOf(productColors),
    }
  })
}

function toPhoto(p: PhotoRow): ProductPhoto {
  return {
    id: p.id,
    colorId: p.color_id,
    view: p.view,
    source: p.source,
    output: p.output ?? undefined,
    // Completed dresses have results but no jobs. A generated photo always has a job;
    // "queued" covers the instant between insert and first read.
    status: p.job_status ?? (p.output ? "done" : "queued"),
    error: p.job_error ?? undefined,
    startedAt: isoOrUndefined(p.job_started_at),
  }
}

function statusOf(colors: ProductColor[]): ProductStatus {
  const photos = colors.flatMap((c) => c.photos)
  if (photos.some((p) => p.status === "queued" || p.status === "processing")) return "generating"
  if (photos.some((p) => p.status === "failed")) return "attention"
  return "ready"
}

export async function listProducts(): Promise<Product[]> {
  const rows = await getDb().query<ProductRow>(
    "SELECT * FROM products ORDER BY created_at DESC LIMIT 300",
  )
  return assemble(rows)
}

export async function getProducts(ids: string[]): Promise<Product[]> {
  const valid = ids.filter(isUuid)
  if (!valid.length) return []
  const rows = await getDb().query<ProductRow>(
    "SELECT * FROM products WHERE id = ANY($1::uuid[]) ORDER BY created_at",
    [valid],
  )
  return assemble(rows)
}

export async function getProduct(id: string): Promise<Product> {
  const [product] = await getProducts([id])
  if (!product) throw new StoreError("not_found", "Dress not found")
  return product
}

export type NewProductInput = {
  price: number
  sizes: string[]
  note?: string
  colors: {
    name: string
    quantities: Record<string, number>
    photos: { view: PhotoView; source: StoredImage; originalName: string }[]
  }[]
}

/**
 * Save a submitted dress and queue one edit per photo, all in one statement so a failure
 * can't leave a half-saved dress. Returns the product and its jobs.
 */
export async function createProduct(
  input: NewProductInput,
  template: Template,
): Promise<{ product: Product; jobs: Job[] }> {
  const productId = randomUUID()
  const colors: { id: string; name: string; position: number; quantities: object }[] = []
  const photos: { id: string; color_id: string; view: string; source: StoredImage }[] = []
  const jobs: Job[] = []
  input.colors.forEach((c, position) => {
    const colorId = randomUUID()
    colors.push({ id: colorId, name: c.name, position, quantities: c.quantities })
    for (const p of c.photos) {
      const photoId = randomUUID()
      photos.push({ id: photoId, color_id: colorId, view: p.view, source: p.source })
      jobs.push(newJob(template, { originalName: p.originalName, source: p.source, photoId }))
    }
  })
  // Stagger so the queue (ordered by created_at) runs photos in form order.
  const start = Date.now()
  jobs.forEach((j, i) => (j.createdAt = new Date(start + i).toISOString()))

  await getDb().query(
    `WITH p AS (
       INSERT INTO products (id, price, sizes, note, template_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id
     ), c AS (
       INSERT INTO product_colors (id, product_id, name, position, quantities)
       SELECT x.id, (SELECT id FROM p), x.name, x.position, x.quantities
       FROM jsonb_to_recordset($6::jsonb) AS x(id uuid, name text, position int, quantities jsonb)
       RETURNING id
     ), ph AS (
       INSERT INTO product_photos (id, product_id, color_id, view, source)
       SELECT x.id, (SELECT id FROM p), x.color_id, x.view, x.source
       FROM jsonb_to_recordset($7::jsonb) AS x(id uuid, color_id uuid, view text, source jsonb)
       WHERE EXISTS (SELECT 1 FROM c)
       RETURNING id
     )
     INSERT INTO jobs (id, template_id, template_snapshot, original_name, source, photo_id, status,
       created_at)
     SELECT x.id, x.template_id, x.template_snapshot, x.original_name, x.source, x.photo_id,
       'queued', x.created_at
     FROM jsonb_to_recordset($8::jsonb) AS x(id uuid, template_id uuid, template_snapshot jsonb,
       original_name text, source jsonb, photo_id uuid, created_at timestamptz)
     WHERE EXISTS (SELECT 1 FROM ph)`,
    [
      productId,
      input.price,
      input.sizes,
      input.note ?? null,
      template.id,
      JSON.stringify(colors),
      JSON.stringify(photos),
      JSON.stringify(
        jobs.map((j) => ({
          id: j.id,
          template_id: j.templateId,
          template_snapshot: j.templateSnapshot,
          original_name: j.originalName,
          source: j.source,
          photo_id: j.photoId,
          created_at: j.createdAt,
        })),
      ),
    ],
  )
  return { product: await getProduct(productId), jobs }
}

/** The product, colour and photo a job is for. */
export async function getPhotoContext(photoId: string) {
  const [row] = await getDb().query<{ product_id: string }>(
    "SELECT product_id FROM product_photos WHERE id = $1",
    [photoId],
  )
  if (!row) throw new StoreError("not_found", "This photo's dress was deleted")
  const product = await getProduct(row.product_id)
  const color = product.colors.find((c) => c.photos.some((p) => p.id === photoId))!
  const photo = color.photos.find((p) => p.id === photoId)!
  return { product, color, photo }
}

export type CompletedProductInput = {
  name: string
  handle: string
  price: number
  sizes: string[]
  note?: string
  colors: {
    name: string
    quantities: Record<string, number>
    photos: { view: PhotoView; image: StoredImage }[]
  }[]
}

/** Save a dress uploaded already edited: its photos are both source and result, no jobs. */
export async function createCompletedProduct(input: CompletedProductInput): Promise<Product> {
  const productId = randomUUID()
  const colors: { id: string; name: string; position: number; quantities: object }[] = []
  const photos: { id: string; color_id: string; view: string; image: StoredImage }[] = []
  input.colors.forEach((c, position) => {
    const colorId = randomUUID()
    colors.push({ id: colorId, name: c.name, position, quantities: c.quantities })
    for (const p of c.photos) {
      photos.push({ id: randomUUID(), color_id: colorId, view: p.view, image: p.image })
    }
  })
  try {
    await getDb().query(
      `WITH p AS (
         INSERT INTO products (id, kind, name, handle, price, sizes, note)
         VALUES ($1, 'completed', $2, $3, $4, $5, $6) RETURNING id
       ), c AS (
         INSERT INTO product_colors (id, product_id, name, position, quantities)
         SELECT x.id, (SELECT id FROM p), x.name, x.position, x.quantities
         FROM jsonb_to_recordset($7::jsonb) AS x(id uuid, name text, position int, quantities jsonb)
         RETURNING id
       )
       INSERT INTO product_photos (id, product_id, color_id, view, source, output)
       SELECT x.id, (SELECT id FROM p), x.color_id, x.view, x.image, x.image
       FROM jsonb_to_recordset($8::jsonb) AS x(id uuid, color_id uuid, view text, image jsonb)
       WHERE EXISTS (SELECT 1 FROM c)`,
      [
        productId,
        input.name,
        input.handle,
        input.price,
        input.sizes,
        input.note ?? null,
        JSON.stringify(colors),
        JSON.stringify(photos),
      ],
    )
  } catch (err) {
    if (isUniqueViolation(err)) throw new StoreError("conflict", "That dress name was just taken")
    throw err
  }
  return getProduct(productId)
}

/** The first handle for `name` no dress uses yet. */
export async function freeHandle(name: string): Promise<string> {
  const base = slugify(name, "dress")
  const rows = await getDb().query<{ handle: string }>(
    "SELECT handle FROM products WHERE handle = $1 OR handle LIKE $1 || '-%'",
    [base],
  )
  const taken = new Set(rows.map((r) => r.handle))
  for (const handle of handles(name)) if (!taken.has(handle)) return handle
  throw new Error("unreachable")
}

/** "Satin Wrap Midi Dress" → "satin-wrap-midi-dress", then "-2", "-3"… */
function* handles(name: string) {
  const base = slugify(name, "dress")
  yield base
  for (let n = 2; ; n++) yield `${base}-${n}`
}

/** Give an unnamed product its first name. Returns the product, named by whoever got there first. */
export async function nameProductOnce(id: string, name: string): Promise<Product> {
  for (const handle of handles(name)) {
    try {
      // No-op if a concurrent job named it first; either way we're done.
      await getDb().query(
        `UPDATE products SET name = $2, handle = $3, updated_at = now()
         WHERE id = $1 AND name IS NULL`,
        [id, name, handle],
      )
      break
    } catch (err) {
      if (!isUniqueViolation(err)) throw err
    }
  }
  return getProduct(id)
}

/** Handle for a new name: the current one if the name still slugifies to it, else the first free one. */
export async function planHandle(product: Product, name: string): Promise<string> {
  const base = slugify(name, "dress")
  if (product.handle && product.handle.replace(/-\d+$/, "") === base) return product.handle
  const rows = await getDb().query<{ handle: string }>(
    `SELECT handle FROM products
     WHERE (handle = $1 OR handle LIKE $1 || '-%') AND id <> $2`,
    [base, product.id],
  )
  const taken = new Set(rows.map((r) => r.handle))
  for (const handle of handles(name)) if (!taken.has(handle)) return handle
  throw new Error("unreachable")
}

export async function saveProduct(
  id: string,
  patch: {
    name?: string
    handle?: string
    price?: number
    sizes?: string[]
    colors?: { id: string; name: string; quantities: Record<string, number> }[]
  },
): Promise<void> {
  try {
    await getDb().query(
      `UPDATE products SET name = COALESCE($2, name), handle = COALESCE($3, handle),
         price = COALESCE($4, price), sizes = COALESCE($5, sizes), updated_at = now()
       WHERE id = $1`,
      [id, patch.name ?? null, patch.handle ?? null, patch.price ?? null, patch.sizes ?? null],
    )
  } catch (err) {
    if (isUniqueViolation(err)) throw new StoreError("conflict", "That name was just taken")
    throw err
  }
  if (patch.colors?.length) {
    await getDb().query(
      `UPDATE product_colors c SET name = x.name, quantities = x.quantities
       FROM jsonb_to_recordset($2::jsonb) AS x(id uuid, name text, quantities jsonb)
       WHERE c.id = x.id AND c.product_id = $1`,
      [id, JSON.stringify(patch.colors)],
    )
  }
}

/** Record a photo's result; `alsoSource` for completed dresses, where they're the same file. */
export async function setPhotoOutput(
  photoId: string,
  output: StoredImage,
  alsoSource = false,
): Promise<void> {
  await getDb().query(
    `UPDATE product_photos SET output = $2, source = CASE WHEN $3 THEN $2 ELSE source END
     WHERE id = $1`,
    [photoId, JSON.stringify(output), alsoSource],
  )
}

/** The photo's result file is gone (deleted before a failed re-upload). */
export async function clearPhotoOutput(photoId: string): Promise<void> {
  await getDb().query("UPDATE product_photos SET output = NULL WHERE id = $1", [photoId])
}

export async function markExported(ids: string[]): Promise<void> {
  await getDb().query("UPDATE products SET exported_at = now() WHERE id = ANY($1::uuid[])", [
    ids.filter(isUuid),
  ])
}

/** Delete a dress, its colours, photos and jobs. Returns its photos for ImageKit cleanup. */
export async function deleteProduct(id: string): Promise<ProductPhoto[]> {
  const product = await getProduct(id)
  const photos = product.colors.flatMap((c) => c.photos)
  await getDb().query("DELETE FROM jobs WHERE photo_id = ANY($1::uuid[])", [
    photos.map((p) => p.id),
  ])
  await getDb().query("DELETE FROM products WHERE id = $1", [id])
  return photos
}
