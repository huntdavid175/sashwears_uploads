import { after } from "next/server"

import { errorResponse, kickWorker } from "@/lib/api"
import { hasQueuedJobs } from "@/lib/queue"
import { failStaleJobs } from "@/lib/store/jobs"
import { getShoot } from "@/lib/store/shoots"

/** Polled while the shoot generates; also restarts a stalled worker chain. */
export async function GET(request: Request, ctx: RouteContext<"/api/shoots/[id]">) {
  const origin = new URL(request.url).origin
  try {
    const { id } = await ctx.params
    await failStaleJobs()
    const shoot = await getShoot(id)
    after(async () => {
      if (await hasQueuedJobs()) await kickWorker(origin)
    })
    return Response.json(shoot)
  } catch (err) {
    return errorResponse(err)
  }
}
