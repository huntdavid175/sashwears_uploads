import { defined, errorResponse, readJson, templateImages, templateInput } from "@/lib/api"
import {
  deleteTemplate,
  getTemplate,
  setDefaultTemplate,
  updateTemplate,
} from "@/lib/store/templates"

export async function GET(_req: Request, ctx: RouteContext<"/api/templates/[id]">) {
  try {
    const { id } = await ctx.params
    return Response.json(await getTemplate(id))
  } catch (err) {
    return errorResponse(err)
  }
}

/**
 * Partial update; `shots: [{ name, fileId } | { name, key }]` replaces the shot list (a `key`
 * keeps that shot's photo) and `isDefault: true` makes this the template new sets start with.
 */
export async function PATCH(request: Request, ctx: RouteContext<"/api/templates/[id]">) {
  try {
    const { id } = await ctx.params
    const body = await readJson(request)
    const images = await templateImages(body, await getTemplate(id))
    if (body.isDefault === true) await setDefaultTemplate(id)
    return Response.json(await updateTemplate(id, defined(templateInput(body)), images))
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
