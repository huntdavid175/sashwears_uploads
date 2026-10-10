import { errorResponse, kickWorkerAfter } from "@/lib/api"
import { regeneratePhoto } from "@/lib/queue"

/** Run one photo again (also how a failed photo is retried). Replaces its ImageKit file. */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/products/[id]/photos/[photoId]/regenerate">,
) {
  const origin = new URL(request.url).origin
  try {
    const { id, photoId } = await ctx.params
    const product = await regeneratePhoto(id, photoId)
    kickWorkerAfter(origin)
    return Response.json(product)
  } catch (err) {
    return errorResponse(err)
  }
}
