import { errorResponse, readJson } from "@/lib/api"
import { renameJob } from "@/lib/queue"
import { StoreError } from "@/lib/store/errors"

/** Rename a dress: `{ name }`. Renames its ImageKit file too. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/jobs/[id]">) {
  try {
    const { id } = await ctx.params
    const body = await readJson(request)
    if (typeof body.name !== "string") throw new StoreError("invalid", "Send { name }")
    return Response.json(await renameJob(id, body.name))
  } catch (err) {
    return errorResponse(err)
  }
}
