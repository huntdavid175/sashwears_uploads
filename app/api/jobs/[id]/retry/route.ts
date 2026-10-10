import { errorResponse, kickWorkerAfter } from "@/lib/api"
import { retryJob } from "@/lib/queue"

export async function POST(request: Request, ctx: RouteContext<"/api/jobs/[id]/retry">) {
  const origin = new URL(request.url).origin
  try {
    const { id } = await ctx.params
    const job = await retryJob(id)
    kickWorkerAfter(origin)
    return Response.json(job)
  } catch (err) {
    return errorResponse(err)
  }
}
