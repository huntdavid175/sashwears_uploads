import "server-only"

import {
  deleteImage,
  downloadImage,
  imagekitFolder,
  renameImage,
  toUploadError,
  uploadImage,
} from "@/lib/imagekit"
import { editImage, toEditError } from "@/lib/openai/edit"
import { cleanName, nameProduct } from "@/lib/openai/name"
import { pickSize } from "@/lib/size"
import { StoreError } from "@/lib/store/errors"
import {
  addJobs,
  claimNextJob,
  createDress,
  failStaleJobs,
  finishJob,
  getDress,
  getJob,
  hasQueuedJobs,
  newJob,
  planDressFileName,
  requeueJob,
  saveDress,
  setJobDress,
} from "@/lib/store/jobs"
import { getTemplate } from "@/lib/store/templates"
import type { Job } from "@/lib/types"

/**
 * How jobs run on Vercel: there is no long-lived process, so each job runs in its own
 * invocation of POST /api/worker (see app/api/worker/route.ts). Enqueueing "kicks" the worker
 * up to CONCURRENCY times; each invocation claims one queued job, runs it, then kicks again
 * for the next. Polling GET /api/jobs also kicks while work is queued, so a lost kick only
 * delays a job. Jobs killed by the function timeout are failed by failStaleJobs().
 */
export const CONCURRENCY = 2

export async function enqueue(jobs: Job[]) {
  await addJobs(jobs)
}

export async function retryJob(id: string) {
  return requeueJob(id)
}

/**
 * New job from the same source photo, using the template's current settings if it still
 * exists. It keeps the dress, so its result replaces the same ImageKit file.
 */
export async function regenerateJob(id: string) {
  const job = await getJob(id)
  const template = await getTemplate(job.templateId).catch(() => null)
  const fresh = newJob(
    template ?? {
      ...job.templateSnapshot,
      id: job.templateId,
      createdAt: job.createdAt,
      updatedAt: job.createdAt,
    },
    { originalName: job.originalName, source: job.source, dressId: job.dressId },
  )
  await enqueue([fresh])
  return fresh
}

/** Claim and run one queued job if a slot is free. Returns whether a job ran. */
export async function runNext(): Promise<boolean> {
  const stale = await failStaleJobs()
  if (stale) console.warn(`[queue] failed ${stale} timed-out job(s)`)
  const job = await claimNextJob(CONCURRENCY)
  if (!job) return false
  await runJob(job)
  return true
}

export { hasQueuedJobs }

async function runJob(job: Job) {
  const { templateSnapshot: snap } = job
  try {
    const [source, reference] = await Promise.all([
      downloadImage(job.source),
      downloadImage(snap.reference),
    ])
    const size = pickSize(snap.model, job.source.width, job.source.height)

    // Naming looks at the source photo, so it runs alongside the (much slower) edit.
    const [image, dress] = await Promise.all([
      editImage({ settings: snap, source, reference, size }),
      job.dressId ? getDress(job.dressId) : nameNewDress(job, source),
    ])

    const ext = snap.outputFormat === "jpeg" ? "jpg" : snap.outputFormat
    const fileName = `${dress.fileName}.${ext}`
    const folder = dress.image
      ? dress.image.filePath.replace(/\/[^/]*$/, "")
      : imagekitFolder(snap.slug)
    const uploaded = await uploadImage({
      data: image,
      folder,
      fileName,
      replace: dress.image?.filePath === `${folder}/${fileName}`,
    })
    // A different output format means a different file; drop the old one so a dress has one.
    if (dress.image && dress.image.fileId !== uploaded.fileId) {
      await deleteImage(dress.image.fileId).catch((err) =>
        console.warn("[queue] couldn't delete replaced file:", toUploadError(err).message),
      )
    }
    await saveDress(dress.id, { image: uploaded })
    await finishJob(job.id, { status: "done", size })
  } catch (err) {
    const message = toEditError(err).message
    console.error(`[queue] job ${job.id} failed:`, message)
    await finishJob(job.id, { status: "failed", error: message }).catch((e) =>
      console.error("[queue] could not record failure", e),
    )
  }
}

/** Name the dress and link it to the job right away, so a retry doesn't name it again. */
async function nameNewDress(job: Job, source: Buffer) {
  const dress = await createDress(await nameProduct(source, job.originalName))
  await setJobDress(job.id, dress.id)
  return dress
}

/** Rename a dress: its name, its file name, and its file on ImageKit. */
export async function renameJob(id: string, rawName: string): Promise<Job> {
  const name = cleanName(rawName)
  if (!name) throw new StoreError("invalid", "Name can't be empty")
  const job = await getJob(id)
  if (!job.dressId) throw new StoreError("invalid", "This photo hasn't been named yet")
  if (job.status === "processing") {
    throw new StoreError("invalid", "Wait for this photo to finish before renaming it")
  }
  const dress = await getDress(job.dressId)
  const fileName = await planDressFileName(dress, name)

  let image = dress.image
  if (image && fileName !== dress.fileName) {
    const ext = image.filePath.slice(image.filePath.lastIndexOf("."))
    try {
      image = await renameImage(image, `${fileName}${ext}`)
    } catch (err) {
      throw new StoreError("invalid", `Couldn't rename on ImageKit: ${toUploadError(err).message}`)
    }
  }
  await saveDress(dress.id, { name, fileName, image })
  return getJob(id)
}
