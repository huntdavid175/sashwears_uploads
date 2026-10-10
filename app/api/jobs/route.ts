import { after } from "next/server"

import { errorResponse, kickWorker } from "@/lib/api"
import { hasQueuedJobs } from "@/lib/queue"
import { failStaleJobs, listJobs } from "@/lib/store/jobs"

export async function GET(request: Request) {
  // Outside the try: reading the URL is what tells Next not to prerender, and that signal is
  // thrown — errorResponse() would otherwise swallow and log it during `next build`.
  const url = new URL(request.url)
  const templateId = url.searchParams.get("templateId") ?? undefined
  try {
    await failStaleJobs()
    const jobs = await listJobs({ templateId })
    // The client polls this while work is pending; use that to restart a stalled chain.
    after(async () => {
      if (await hasQueuedJobs()) await kickWorker(url.origin)
    })
    return Response.json(jobs)
  } catch (err) {
    return errorResponse(err)
  }
}
