import { errorResponse, kickWorkerAfter } from "@/lib/api"
import { regenerateShootImage } from "@/lib/queue"

/** Make one image again (also how a failed one is retried). Replaces its ImageKit file. */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/shoots/[id]/images/[imageId]/regenerate">,
) {
  const origin = new URL(request.url).origin
  try {
    const { id, imageId } = await ctx.params
    const shoot = await regenerateShootImage(id, imageId)
    kickWorkerAfter(origin)
    return Response.json(shoot)
  } catch (err) {
    return errorResponse(err)
  }
}
