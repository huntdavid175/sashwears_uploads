import { after } from "next/server"

import { errorResponse, kickWorker, readJson } from "@/lib/api"
import { normalizeColorName, normalizeQuantities, normalizeSizes, parsePrice } from "@/lib/dress"
import { deleteImage, toUploadError } from "@/lib/imagekit"
import { hasQueuedJobs, updateProduct, type ProductPatch } from "@/lib/queue"
import { StoreError } from "@/lib/store/errors"
import { failStaleJobs } from "@/lib/store/jobs"
import { deleteProduct, getProduct } from "@/lib/store/products"

export async function GET(request: Request, ctx: RouteContext<"/api/products/[id]">) {
  const origin = new URL(request.url).origin
  try {
    const { id } = await ctx.params
    await failStaleJobs()
    const product = await getProduct(id)
    after(async () => {
      if (await hasQueuedJobs()) await kickWorker(origin)
    })
    return Response.json(product)
  } catch (err) {
    return errorResponse(err)
  }
}

/**
 * Edit `{ name?, price?, sizes?, colors?: [{ id, name, quantities }] }`. Renaming the dress or
 * a colour renames its files on ImageKit.
 */
export async function PATCH(request: Request, ctx: RouteContext<"/api/products/[id]">) {
  try {
    const { id } = await ctx.params
    const body = await readJson(request)
    const current = await getProduct(id)
    const patch: ProductPatch = {}
    try {
      if (typeof body.name === "string") patch.name = body.name
      if (body.price !== undefined) patch.price = parsePrice(body.price)
      if (body.sizes !== undefined) patch.sizes = normalizeSizes(body.sizes)
      if (Array.isArray(body.colors)) {
        const sizes = patch.sizes ?? current.sizes
        patch.colors = body.colors.map(
          (c: { id?: unknown; name?: unknown; quantities?: unknown }) => {
            if (typeof c?.id !== "string") throw new Error("Missing colour id")
            return {
              id: c.id,
              name: normalizeColorName(c.name),
              quantities: normalizeQuantities(c.quantities, sizes),
            }
          },
        )
        const lower = patch.colors.map((c) => c.name.toLowerCase())
        if (new Set(lower).size !== lower.length) throw new Error("Two colours have the same name")
      }
    } catch (err) {
      throw new StoreError("invalid", (err as Error).message)
    }
    return Response.json(await updateProduct(id, patch))
  } catch (err) {
    return errorResponse(err)
  }
}

/** Delete the dress and its photos (originals and results) from ImageKit. */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/products/[id]">) {
  try {
    const { id } = await ctx.params
    const photos = await deleteProduct(id)
    // Completed dresses use one file as both source and result: delete it once.
    const files = new Set(
      photos.flatMap((p) => [p.source.fileId, ...(p.output ? [p.output.fileId] : [])]),
    )
    await Promise.all(
      [...files].map((fileId) =>
        deleteImage(fileId).catch((err) =>
          console.warn("[products] couldn't delete ImageKit file:", toUploadError(err).message),
        ),
      ),
    )
    return new Response(null, { status: 204 })
  } catch (err) {
    return errorResponse(err)
  }
}
