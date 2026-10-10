import { errorResponse, kickWorkerAfter } from "@/lib/api"
import { regenerateJob } from "@/lib/queue"

export async function POST(request: Request, ctx: RouteContext<"/api/jobs/[id]/regenerate">) {
  const origin = new URL(request.url).origin
  try {
    const { id } = await ctx.params
    const job = await regenerateJob(id)
    kickWorkerAfter(origin)
    return Response.json(job, { status: 201 })
  } catch (err) {
    return errorResponse(err)
  }
}
