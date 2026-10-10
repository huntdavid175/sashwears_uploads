import { errorResponse, readJson } from "@/lib/api"
import { MAX_COMPLETED_PHOTOS } from "@/lib/dress"
import { getStoredImage } from "@/lib/imagekit"
import { toEditError } from "@/lib/openai/edit"
import { sortDressPhotos, type PhotoSort } from "@/lib/openai/classify"
import { StoreError } from "@/lib/store/errors"

/**
 * Suggest how a finished dress's photos group into colours: `{ files: [{ fileId, originalName }] }`
 * → `{ name, photos: [{ fileId, originalName, image, color, view }], warning? }`. Saves nothing;
 * the store owner reviews the suggestion and then submits the dress.
 */
export async function POST(request: Request) {
  try {
    const body = await readJson(request)
    const files = Array.isArray(body.files) ? body.files : []
    if (!files.length) throw new StoreError("invalid", "Add the dress's photos")
    if (files.length > MAX_COMPLETED_PHOTOS) {
      throw new StoreError("invalid", `Up to ${MAX_COMPLETED_PHOTOS} photos per dress`)
    }
    const photos = await Promise.all(
      files.map(async (f: { fileId?: unknown; originalName?: unknown }) => {
        if (typeof f?.fileId !== "string") throw new StoreError("invalid", "Missing fileId")
        return {
          fileId: f.fileId,
          originalName: typeof f.originalName === "string" ? f.originalName.slice(0, 200) : "",
          image: await getStoredImage(f.fileId),
        }
      }),
    )

    let name = ""
    let sorted: PhotoSort[]
    let warning: string | undefined
    try {
      const result = await sortDressPhotos(photos.map((p) => p.image))
      name = result.name
      sorted = result.photos
    } catch (err) {
      // Still usable: everything lands in one colour for the owner to arrange.
      console.warn("[classify] sorting failed:", toEditError(err).message)
      warning = "Couldn't sort the photos automatically — please arrange them by colour."
      sorted = photos.map(() => ({ color: "Unsorted", view: "front" as const }))
    }
    return Response.json({
      name,
      warning,
      photos: photos.map((p, i) => ({ ...p, ...sorted[i] })),
    })
  } catch (err) {
    return errorResponse(err)
  }
}
