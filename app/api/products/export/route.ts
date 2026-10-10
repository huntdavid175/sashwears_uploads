import { errorResponse, readJson } from "@/lib/api"
import { toShopifyCsv } from "@/lib/shopify"
import { StoreError } from "@/lib/store/errors"
import { getProducts, markExported } from "@/lib/store/products"

/** `{ ids }` → Shopify product CSV for those dresses, which are then marked exported. */
export async function POST(request: Request) {
  try {
    const body = await readJson(request)
    const ids = Array.isArray(body.ids) ? body.ids.filter((x) => typeof x === "string") : []
    const products = await getProducts(ids)
    if (!products.length) throw new StoreError("invalid", "Choose at least one dress to export")

    let csv: string
    try {
      csv = toShopifyCsv(products)
    } catch (err) {
      throw new StoreError("invalid", (err as Error).message)
    }
    await markExported(products.map((p) => p.id))
    const stamp = new Date().toISOString().slice(0, 10)
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="shopify-products-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (err) {
    return errorResponse(err)
  }
}
