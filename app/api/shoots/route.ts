import { errorResponse, kickWorkerAfter, readJson } from "@/lib/api"
import { MAX_COLORS, normalizeColorName } from "@/lib/dress"
import { getStoredImage } from "@/lib/imagekit"
import { cleanDescription } from "@/lib/openai/classify"
import { cleanName } from "@/lib/openai/name"
import { CONCURRENCY, createShootFromPhotos } from "@/lib/queue"
import { MAX_PER_SIDE, MAX_SHOOT_PHOTOS } from "@/lib/shoot"
import { StoreError } from "@/lib/store/errors"

type ColorInput = { name?: unknown; photos?: { fileId?: unknown; view?: unknown }[] }

/**
 * Start a shoot: `{ templateId, name, description, colors: [{ name, photos: [{ fileId, view }] }] }`
 * with photos the browser already put on ImageKit. Every colour gets a front and a back on the
 * template's model; generation starts right away.
 */
export async function POST(request: Request) {
  const origin = new URL(request.url).origin
  try {
    const body = await readJson(request)
    if (typeof body.templateId !== "string") throw new StoreError("invalid", "Pick a template")
    const name = typeof body.name === "string" ? cleanName(body.name) : ""
    if (!name) throw new StoreError("invalid", "Give the set a name")
    const description =
      typeof body.description === "string" ? cleanDescription(body.description) : ""

    const colors = (Array.isArray(body.colors) ? body.colors : []) as ColorInput[]
    if (!colors.length) throw new StoreError("invalid", "Add the garment photos")
    if (colors.length > MAX_COLORS) throw new StoreError("invalid", `Up to ${MAX_COLORS} colours`)
    const names = colors.map((c) => {
      try {
        return normalizeColorName(c?.name)
      } catch (err) {
        throw new StoreError("invalid", (err as Error).message)
      }
    })
    const lower = names.map((n) => n.toLowerCase())
    const repeat = names.find((_, i) => lower.indexOf(lower[i]) !== i)
    if (repeat) throw new StoreError("invalid", `"${repeat}" is listed twice`)

    const photos = colors.map((c) => (Array.isArray(c.photos) ? c.photos : []))
    const fileIds = photos.flat().map((p) => p?.fileId)
    if (fileIds.length > MAX_SHOOT_PHOTOS) {
      throw new StoreError("invalid", `Up to ${MAX_SHOOT_PHOTOS} photos per set`)
    }
    if (new Set(fileIds).size !== fileIds.length) {
      throw new StoreError("invalid", "A photo is listed twice")
    }

    const shoot = await createShootFromPhotos({
      templateId: body.templateId,
      name,
      description,
      colors: await Promise.all(
        photos.map(async (list, i) => {
          if (!list.length) throw new StoreError("invalid", `${names[i]} has no photos`)
          for (const view of ["front", "back"]) {
            if (list.filter((p) => p?.view === view).length > MAX_PER_SIDE) {
              throw new StoreError(
                "invalid",
                `${names[i]} has more than ${MAX_PER_SIDE} ${view} photos`,
              )
            }
          }
          return {
            name: names[i],
            photos: await Promise.all(
              list.map(async (p) => {
                if (typeof p?.fileId !== "string") throw new StoreError("invalid", "Missing fileId")
                if (p.view !== "front" && p.view !== "back") {
                  throw new StoreError("invalid", "Each photo must be a front or a back")
                }
                return { view: p.view, image: await getStoredImage(p.fileId) }
              }),
            ),
          }
        }),
      ),
    })
    kickWorkerAfter(origin, CONCURRENCY)
    return Response.json(shoot, { status: 201 })
  } catch (err) {
    return errorResponse(err)
  }
}
