import { errorResponse, readJson } from "@/lib/api"
import { updateDress } from "@/lib/queue"

/**
 * Edit the job's dress: `{ name?, colors?, price? }`. A new name also renames the ImageKit file;
 * `colors` is a list (or comma-separated text); `price: null` or "" clears it.
 */
export async function PATCH(request: Request, ctx: RouteContext<"/api/jobs/[id]">) {
  try {
    const { id } = await ctx.params
    const { name, colors, price } = await readJson(request)
    return Response.json(await updateDress(id, { name, colors, price }))
  } catch (err) {
    return errorResponse(err)
  }
}
