import { defined, errorResponse, readJson, templateInput } from "@/lib/api"
import { getStoredImage } from "@/lib/imagekit"
import { deleteTemplate, getTemplate, updateTemplate } from "@/lib/store/templates"

export async function GET(_req: Request, ctx: RouteContext<"/api/templates/[id]">) {
  try {
    const { id } = await ctx.params
    return Response.json(await getTemplate(id))
  } catch (err) {
    return errorResponse(err)
  }
}

/** Partial update; `referenceFileId` swaps the background for a newly uploaded one. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/templates/[id]">) {
  try {
    const { id } = await ctx.params
    const body = await readJson(request)
    const reference =
      typeof body.referenceFileId === "string"
        ? await getStoredImage(body.referenceFileId)
        : undefined
    return Response.json(await updateTemplate(id, defined(templateInput(body)), reference))
  } catch (err) {
    return errorResponse(err)
  }
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/templates/[id]">) {
  try {
    const { id } = await ctx.params
    await deleteTemplate(id)
    return new Response(null, { status: 204 })
  } catch (err) {
    return errorResponse(err)
  }
}
