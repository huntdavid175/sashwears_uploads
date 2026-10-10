import "server-only"

import {
  downloadImage,
  imagekitFolder,
  putImage,
  ReplacedError,
  relocateImage,
  toUploadError,
} from "@/lib/imagekit"
import { editImage, toEditError } from "@/lib/openai/edit"
import { cleanName, nameProduct } from "@/lib/openai/name"
import { pickSize } from "@/lib/size"
import { StoreError } from "@/lib/store/errors"
import {
  addJobs,
  claimNextJob,
  failStaleJobs,
  finishJob,
  hasQueuedJobs,
  newJob,
} from "@/lib/store/jobs"
import {
  clearPhotoOutput,
  createCompletedProduct,
  freeHandle,
  getPhotoContext,
  getProduct,
  nameProductOnce,
  planHandle,
  saveProduct,
  setPhotoOutput,
} from "@/lib/store/products"
import { getDefaultTemplate, getTemplate, slugify } from "@/lib/store/templates"
import type { Job, PhotoView, Product, ProductColor, ProductPhoto, StoredImage } from "@/lib/types"

/**
 * How jobs run on Vercel: there is no long-lived process, so each job runs in its own
 * invocation of POST /api/worker (see app/api/worker/route.ts). Enqueueing "kicks" the worker
 * up to CONCURRENCY times; each invocation claims one queued job, runs it, then kicks again
 * for the next. Polling the dresses API also kicks while work is queued, so a lost kick only
 * delays a job. Jobs killed by the function timeout are failed by failStaleJobs().
 */
export const CONCURRENCY = 2

/** Each dress has its own folder on ImageKit, named after it. */
export function dressFolder(handle: string) {
  return imagekitFolder(`dresses/${handle}`)
}

export { hasQueuedJobs }

/** Claim and run one queued job if a slot is free. Returns whether a job ran. */
export async function runNext(): Promise<boolean> {
  const stale = await failStaleJobs()
  if (stale) console.warn(`[queue] failed ${stale} timed-out job(s)`)
  const job = await claimNextJob(CONCURRENCY)
  if (!job) return false
  await runJob(job)
  return true
}

/** "<handle>-<colour>-<view>.<ext>", e.g. "satin-wrap-midi-dress-wine-back.png". */
export function photoFileName(
  product: Pick<Product, "handle">,
  color: Pick<ProductColor, "name">,
  photo: Pick<ProductPhoto, "view">,
  ext: string,
) {
  return `${product.handle}-${slugify(color.name, "colour")}-${photo.view}.${ext}`
}

async function runJob(job: Job) {
  const { templateSnapshot: snap } = job
  try {
    if (!job.photoId) throw new Error("This job isn't linked to a dress photo")
    const { product, photo } = await getPhotoContext(job.photoId)
    const [source, reference] = await Promise.all([
      downloadImage(job.source),
      downloadImage(snap.reference),
    ])
    const size = pickSize(snap.model, job.source.width, job.source.height)

    // Naming looks at the first colour's front photo, so it runs alongside the slower edit.
    const [image] = await Promise.all([
      editImage({ settings: snap, source, reference, size, view: photo.view }),
      product.name ? null : nameFromCover(product, job, source),
    ])

    // Re-read: the dress may have been named (or renamed) while the edit ran.
    const fresh = await getPhotoContext(job.photoId)
    const ext = snap.outputFormat === "jpeg" ? "jpg" : snap.outputFormat
    const fileName = photoFileName(fresh.product, fresh.color, fresh.photo, ext)
    const folder = dressFolder(fresh.product.handle!)
    let uploaded
    try {
      uploaded = await putImage({ data: image, folder, fileName, previous: fresh.photo.output })
    } catch (err) {
      // The old result was deleted before the upload failed: don't keep pointing at it.
      if (err instanceof ReplacedError) await clearPhotoOutput(job.photoId)
      throw err
    }
    await setPhotoOutput(job.photoId, uploaded)
    await finishJob(job.id, { status: "done", size })
  } catch (err) {
    const message = toEditError(err).message
    console.error(`[queue] job ${job.id} failed:`, message)
    await finishJob(job.id, { status: "failed", error: message }).catch((e) =>
      console.error("[queue] could not record failure", e),
    )
  }
}

/** Name the dress from its first colour's front photo (reusing this job's bytes if it's that one). */
async function nameFromCover(product: Product, job: Job, source: Buffer) {
  const cover = product.colors[0]?.photos.find((p) => p.view === "front")
  const data = !cover || cover.id === job.photoId ? source : await downloadImage(cover.source)
  await nameProductOnce(product.id, await nameProduct(data, job.originalName))
}

/** Run one photo again with the dress's template as it is now (or the default one). */
export async function regeneratePhoto(productId: string, photoId: string): Promise<Product> {
  const product = await getProduct(productId)
  const photo = product.colors.flatMap((c) => c.photos).find((p) => p.id === photoId)
  if (!photo) throw new StoreError("not_found", "Photo not found")
  if (product.kind === "completed") {
    throw new StoreError("invalid", "This dress was uploaded already edited")
  }
  if (photo.status === "queued" || photo.status === "processing") {
    throw new StoreError("invalid", "This photo is already being generated")
  }
  const template = product.templateId
    ? await getTemplate(product.templateId).catch(() => getDefaultTemplate())
    : await getDefaultTemplate()
  const originalName = photo.source.filePath.slice(photo.source.filePath.lastIndexOf("/") + 1)
  await addJobs([newJob(template, { originalName, source: photo.source, photoId })])
  return getProduct(productId)
}

export type ProductPatch = {
  name?: string
  price?: number
  sizes?: string[]
  colors?: { id: string; name: string; quantities: Record<string, number> }[]
}

/**
 * Edit a dress. A new dress or colour name renames its files on ImageKit to match, so file
 * names always read "<dress>-<colour>-<view>".
 */
export async function updateProduct(id: string, patch: ProductPatch): Promise<Product> {
  const product = await getProduct(id)
  let handle: string | undefined
  if (patch.name !== undefined) {
    const name = cleanName(patch.name)
    if (!name) throw new StoreError("invalid", "Name can't be empty")
    patch.name = name
    if (name !== product.name) handle = await planHandle(product, name)
  }
  if (patch.colors) {
    const known = new Set(product.colors.map((c) => c.id))
    if (patch.colors.some((c) => !known.has(c.id))) {
      throw new StoreError("invalid", "Unknown colour")
    }
  }
  await saveProduct(id, { ...patch, handle })
  await syncFileNames(await getProduct(id))
  return getProduct(id)
}

/**
 * Move/rename any finished photo whose ImageKit path no longer matches
 * "<dress folder>/<dress>-<colour>-<view>.<ext>".
 */
async function syncFileNames(product: Product) {
  if (!product.handle) return
  const folder = dressFolder(product.handle)
  for (const color of product.colors) {
    for (const photo of color.photos) {
      const output = photo.output
      if (!output || photo.status === "processing") continue
      const ext = output.filePath.slice(output.filePath.lastIndexOf(".") + 1)
      const wanted = photoFileName(product, color, photo, ext)
      if (output.filePath === `${folder}/${wanted}`) continue
      try {
        const file = await relocateImage(output, folder, wanted)
        await setPhotoOutput(photo.id, file, product.kind === "completed")
      } catch (err) {
        throw new StoreError(
          "invalid",
          `Saved, but couldn't rename ${wanted} on ImageKit: ${toUploadError(err).message}`,
        )
      }
    }
  }
}

export type CompletedDressInput = {
  name: string
  price: number
  sizes: string[]
  note?: string
  colors: {
    name: string
    quantities: Record<string, number>
    photos: { view: PhotoView; image: StoredImage }[]
  }[]
}

/**
 * Save a dress whose photos were uploaded already edited: move them into the dress's folder,
 * name them "<dress>-<colour>-<view>", and save. Nothing is generated.
 */
export async function createCompletedDress(input: CompletedDressInput): Promise<Product> {
  const handle = await freeHandle(input.name)
  const folder = dressFolder(handle)
  const colors = await Promise.all(
    input.colors.map(async (color) => ({
      ...color,
      photos: await Promise.all(
        color.photos.map(async (photo) => {
          const ext = photo.image.filePath.slice(photo.image.filePath.lastIndexOf(".") + 1)
          const name = photoFileName({ handle }, color, photo, ext.toLowerCase())
          try {
            return { view: photo.view, image: await relocateImage(photo.image, folder, name) }
          } catch (err) {
            throw new StoreError(
              "invalid",
              `Couldn't file ${name} on ImageKit: ${toUploadError(err).message}`,
            )
          }
        }),
      ),
    })),
  )
  return createCompletedProduct({ ...input, handle, colors })
}
