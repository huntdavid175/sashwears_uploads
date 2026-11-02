import { errorResponse, kickWorkerAfter, readJson } from "@/lib/api"
import { MAX_COLORS, normalizeColorName, normalizeProductType, normalizeTags } from "@/lib/dress"
import { getStoredImages } from "@/lib/imagekit"
import { cleanDescription } from "@/lib/openai/classify"
import { cleanName } from "@/lib/openai/name"
import { CONCURRENCY, createBatch } from "@/lib/queue"
import { MAX_BATCH_PHOTOS, MAX_PER_SIDE } from "@/lib/shoot"
import { StoreError } from "@/lib/store/errors"

type PhotoInput = { fileId?: unknown; view?: unknown }
type ColorInput = { name?: unknown; photos?: PhotoInput[] }
type ProductInput = {
  name?: unknown
  description?: unknown
  productType?: unknown
  tags?: unknown
  colors?: ColorInput[]
}

/** One product's name, description and colours, checked. */
function readProduct(input: ProductInput) {
  const name = typeof input?.name === "string" ? cleanName(input.name) : ""
  if (!name) throw new StoreError("invalid", "Give every product a name")
  const description =
    typeof input.description === "string" ? cleanDescription(input.description) : ""

  const colors = Array.isArray(input.colors) ? input.colors : []
  if (!colors.length) throw new StoreError("invalid", `${name} has no photos`)
  if (colors.length > MAX_COLORS) {
    throw new StoreError("invalid", `${name}: up to ${MAX_COLORS} colours`)
  }
  const names = colors.map((c) => {
    try {
      return normalizeColorName(c?.name)
    } catch (err) {
      throw new StoreError("invalid", `${name}: ${(err as Error).message}`)
    }
  })
  const lower = names.map((n) => n.toLowerCase())
  const repeat = names.find((_, i) => lower.indexOf(lower[i]) !== i)
  if (repeat) throw new StoreError("invalid", `${name}: "${repeat}" is listed twice`)

  return {
    name,
    description,
    productType: normalizeProductType(input.productType) || undefined,
    tags: normalizeTags(input.tags),
    colors: colors.map((c, i) => {
      const photos = Array.isArray(c.photos) ? c.photos : []
      if (!photos.length) throw new StoreError("invalid", `${name}: ${names[i]} has no photos`)
      const views = photos.map((p) => p?.view)
      if (views.some((v) => views.filter((x) => x === v).length > MAX_PER_SIDE)) {
        throw new StoreError(
          "invalid",
          `${name}: ${names[i]} has more than ${MAX_PER_SIDE} photos of one shot`,
        )
      }
      return {
        name: names[i],
        photos: photos.map((p) => {
          if (typeof p?.fileId !== "string") throw new StoreError("invalid", "Missing fileId")
          if (typeof p.view !== "string" || !p.view) {
            throw new StoreError("invalid", "Each photo needs a shot")
          }
          return { fileId: p.fileId, view: p.view }
        }),
      }
    }),
  }
}

/**
 * Start a batch: `{ templateId, products: [{ name, description, productType?, tags?, colors: [{ name, photos: [{
 * fileId, view }] }] }] }` with photos the browser already put on ImageKit. Each product becomes
 * a set: every colour in every shot of the template. Generation starts right away.
 */
export async function POST(request: Request) {
  const origin = new URL(request.url).origin
  try {
    const body = await readJson(request)
    if (typeof body.templateId !== "string") throw new StoreError("invalid", "Pick a template")
    const list = (Array.isArray(body.products) ? body.products : []) as ProductInput[]
    if (!list.length) throw new StoreError("invalid", "Add the product photos")
    const products = list.map(readProduct)

    const fileIds = products.flatMap((p) => p.colors.flatMap((c) => c.photos.map((x) => x.fileId)))
    if (fileIds.length > MAX_BATCH_PHOTOS) {
      throw new StoreError("invalid", `Up to ${MAX_BATCH_PHOTOS} photos at once`)
    }
    if (new Set(fileIds).size !== fileIds.length) {
      throw new StoreError("invalid", "A photo is listed twice")
    }
    const images = await getStoredImages(fileIds)
    let next = 0

    const batch = await createBatch(
      body.templateId,
      products.map((p) => ({
        ...p,
        colors: p.colors.map((c) => ({
          name: c.name,
          photos: c.photos.map(({ view }) => ({ view, image: images[next++] })),
        })),
      })),
    )
    kickWorkerAfter(origin, CONCURRENCY)
    return Response.json(batch, { status: 201 })
  } catch (err) {
    return errorResponse(err)
  }
}
