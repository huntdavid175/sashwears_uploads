import { after } from "next/server"

import { errorResponse, kickWorker, kickWorkerAfter, readJson } from "@/lib/api"
import {
  MAX_COLORS,
  MAX_COMPLETED_PHOTOS,
  normalizeColorName,
  normalizeQuantities,
  normalizeSizes,
  parsePrice,
} from "@/lib/dress"
import { getStoredImage } from "@/lib/imagekit"
import { cleanName } from "@/lib/openai/name"
import { CONCURRENCY, createCompletedDress, hasQueuedJobs } from "@/lib/queue"
import { StoreError } from "@/lib/store/errors"
import { failStaleJobs } from "@/lib/store/jobs"
import { createProduct, listProducts, type NewProductInput } from "@/lib/store/products"
import { getDefaultTemplate } from "@/lib/store/templates"

export async function GET(request: Request) {
  // Outside the try: see AGENTS.md (request.url before errorResponse's catch).
  const origin = new URL(request.url).origin
  try {
    await failStaleJobs()
    const products = await listProducts()
    // The client polls while dresses generate; use that to restart a stalled worker chain.
    after(async () => {
      if (await hasQueuedJobs()) await kickWorker(origin)
    })
    return Response.json(products)
  } catch (err) {
    return errorResponse(err)
  }
}

type PhotoRef = { fileId?: unknown; originalName?: unknown }
type ColorInput = { name?: unknown; quantities?: unknown; front?: PhotoRef; back?: PhotoRef }

/**
 * Submit a dress: `{ price, sizes, note?, colors: [{ name, quantities, front, back? }] }` where
 * front/back are `{ fileId, originalName }` of photos the browser already put on ImageKit.
 * The first colour needs front and back; the others a front. Generation starts right away.
 */
export async function POST(request: Request) {
  const origin = new URL(request.url).origin
  try {
    const body = await readJson(request)
    if (body.kind === "completed") {
      const product = await createCompletedDress(await parseCompletedDress(body))
      return Response.json(product, { status: 201 })
    }
    const template = await getDefaultTemplate()
    const input = await parseDress(body)
    const { product } = await createProduct(input, template)
    kickWorkerAfter(origin, CONCURRENCY)
    return Response.json(product, { status: 201 })
  } catch (err) {
    return errorResponse(err)
  }
}

async function parseDress(body: Record<string, unknown>): Promise<NewProductInput> {
  const invalid = <T>(fn: () => T): T => {
    try {
      return fn()
    } catch (err) {
      throw new StoreError("invalid", (err as Error).message)
    }
  }
  const price = invalid(() => parsePrice(body.price))
  const sizes = invalid(() => normalizeSizes(body.sizes))
  const note =
    typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : undefined

  const colors = (Array.isArray(body.colors) ? body.colors : []) as ColorInput[]
  if (!colors.length) throw new StoreError("invalid", "Add at least one colour")
  if (colors.length > MAX_COLORS) throw new StoreError("invalid", `Up to ${MAX_COLORS} colours`)

  const names = colors.map((c) => invalid(() => normalizeColorName(c?.name)))
  const lower = names.map((n) => n.toLowerCase())
  const repeat = names.find((_, i) => lower.indexOf(lower[i]) !== i)
  if (repeat) throw new StoreError("invalid", `"${repeat}" is listed twice`)

  const photo = async (ref: PhotoRef | undefined, what: string) => {
    if (typeof ref?.fileId !== "string") throw new StoreError("invalid", `Add the ${what} photo`)
    const originalName =
      typeof ref.originalName === "string" && ref.originalName.trim()
        ? ref.originalName.trim().slice(0, 200)
        : "photo"
    return { source: await getStoredImage(ref.fileId), originalName }
  }

  return {
    price,
    sizes,
    note,
    colors: await Promise.all(
      colors.map(async (c, i) => {
        const front = await photo(c.front, `${names[i]} front`)
        // Only the first colour has a back photo; extra ones on other colours are ignored.
        const back = i === 0 ? await photo(c.back, `${names[i]} back`) : null
        return {
          name: names[i],
          quantities: invalid(() => normalizeQuantities(c.quantities, sizes)),
          photos: [
            { view: "front" as const, ...front },
            ...(back ? [{ view: "back" as const, ...back }] : []),
          ],
        }
      }),
    ),
  }
}

type CompletedColorInput = {
  name?: unknown
  quantities?: unknown
  photos?: { fileId?: unknown; view?: unknown }[]
}

/**
 * A finished dress: `{ kind: "completed", name, price, sizes, note?, colors: [{ name, quantities,
 * photos: [{ fileId, view }] }] }`. Each colour needs exactly one front and at most one back.
 */
async function parseCompletedDress(body: Record<string, unknown>) {
  const invalid = <T>(fn: () => T): T => {
    try {
      return fn()
    } catch (err) {
      throw new StoreError("invalid", (err as Error).message)
    }
  }
  const name = typeof body.name === "string" ? cleanName(body.name) : ""
  if (!name) throw new StoreError("invalid", "Give the dress a name")
  const price = invalid(() => parsePrice(body.price))
  const sizes = invalid(() => normalizeSizes(body.sizes))
  const note =
    typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : undefined

  const colors = (Array.isArray(body.colors) ? body.colors : []) as CompletedColorInput[]
  if (!colors.length) throw new StoreError("invalid", "Add at least one colour")
  if (colors.length > MAX_COLORS) throw new StoreError("invalid", `Up to ${MAX_COLORS} colours`)
  const names = colors.map((c) => invalid(() => normalizeColorName(c?.name)))
  const lower = names.map((n) => n.toLowerCase())
  const repeat = names.find((_, i) => lower.indexOf(lower[i]) !== i)
  if (repeat) throw new StoreError("invalid", `"${repeat}" is listed twice`)

  const fileIds = colors.flatMap((c) =>
    (Array.isArray(c.photos) ? c.photos : []).map((p) => p?.fileId),
  )
  if (fileIds.length > MAX_COMPLETED_PHOTOS) {
    throw new StoreError("invalid", `Up to ${MAX_COMPLETED_PHOTOS} photos per dress`)
  }
  if (new Set(fileIds).size !== fileIds.length) {
    throw new StoreError("invalid", "A photo is listed twice")
  }

  return {
    name,
    price,
    sizes,
    note,
    colors: await Promise.all(
      colors.map(async (c, i) => {
        const photos = Array.isArray(c.photos) ? c.photos : []
        const views = photos.map((p) => p?.view)
        if (views.filter((v) => v === "front").length !== 1) {
          throw new StoreError("invalid", `${names[i]} needs exactly one front photo`)
        }
        if (views.filter((v) => v === "back").length > 1) {
          throw new StoreError("invalid", `${names[i]} has more than one back photo`)
        }
        if (views.some((v) => v !== "front" && v !== "back")) {
          throw new StoreError("invalid", "Each photo must be a front or a back")
        }
        return {
          name: names[i],
          quantities: invalid(() => normalizeQuantities(c.quantities, sizes)),
          photos: await Promise.all(
            photos.map(async (p) => {
              if (typeof p.fileId !== "string") throw new StoreError("invalid", "Missing fileId")
              return { view: p.view as "front" | "back", image: await getStoredImage(p.fileId) }
            }),
          ),
        }
      }),
    ),
  }
}
