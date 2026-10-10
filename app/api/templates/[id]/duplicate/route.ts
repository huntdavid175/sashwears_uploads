import { errorResponse } from "@/lib/api"
import { duplicateTemplate } from "@/lib/store/templates"

export async function POST(_req: Request, ctx: RouteContext<"/api/templates/[id]/duplicate">) {
  try {
    const { id } = await ctx.params
    return Response.json(await duplicateTemplate(id), { status: 201 })
  } catch (err) {
    return errorResponse(err)
  }
}
