import { errorResponse, kickWorkerAfter, MAX_BATCH, readJson } from "@/lib/api"
import { getStoredImage } from "@/lib/imagekit"
import { CONCURRENCY, enqueue } from "@/lib/queue"
import { StoreError } from "@/lib/store/errors"
import { newJob } from "@/lib/store/jobs"
import { getTemplate } from "@/lib/store/templates"

/**
 * Batch start: `{ sources: [{ fileId, originalName }] }` for photos the browser already
 * uploaded to ImageKit. Each becomes a queued job against this template.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/templates/[id]/jobs">) {
  const origin = new URL(request.url).origin
  try {
    const { id } = await ctx.params
    const template = await getTemplate(id)
    const body = await readJson(request)
    const sources = Array.isArray(body.sources) ? body.sources : []
    if (sources.length === 0) throw new StoreError("invalid", "Add at least one image")
    if (sources.length > MAX_BATCH) {
      throw new StoreError("invalid", `Up to ${MAX_BATCH} images per batch`)
    }

    // Check every file before queueing any, so a bad file doesn't leave a half-queued batch.
    const jobs = await Promise.all(
      sources.map(async (s: { fileId?: unknown; originalName?: unknown }) => {
        if (typeof s?.fileId !== "string") throw new StoreError("invalid", "Missing fileId")
        const originalName =
          typeof s.originalName === "string" && s.originalName.trim()
            ? s.originalName.trim().slice(0, 200)
            : "photo"
        return newJob(template, { originalName, source: await getStoredImage(s.fileId) })
      }),
    )
    await enqueue(jobs)
    kickWorkerAfter(origin, CONCURRENCY)
    return Response.json(jobs, { status: 201 })
  } catch (err) {
    return errorResponse(err)
  }
}
