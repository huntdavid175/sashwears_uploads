import { errorResponse, readJson } from "@/lib/api"
import { normalizeProductType, normalizeTags, parsePrice } from "@/lib/dress"
import { saveShootAsProduct } from "@/lib/queue"
import { StoreError } from "@/lib/store/errors"

/** Copying a product's images goes through this function, one by one. */
export const maxDuration = 300

/**
 * Save a set's finished images as a product: `{ price, stock?, productType?, tags? }`, the stock in
 * the owner's own words and tags a list or comma-separated text. A colour with no finished image
 * is left out; a set with none can't be saved.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/shoots/[id]/save">) {
  try {
    const { id } = await ctx.params
    const body = await readJson(request)
    let input
    try {
      input = {
        price: parsePrice(body.price),
        stock: typeof body.stock === "string" ? body.stock.trim().slice(0, 2000) : "",
        productType: normalizeProductType(body.productType) || undefined,
        tags: normalizeTags(body.tags),
      }
    } catch (err) {
      throw new StoreError("invalid", (err as Error).message)
    }
    return Response.json(await saveShootAsProduct(id, input), { status: 201 })
  } catch (err) {
    return errorResponse(err)
  }
}
