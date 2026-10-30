import { errorResponse, readFiles, readJson } from "@/lib/api"
import { MAX_COMPLETED_PHOTOS } from "@/lib/dress"
import { sortProductPhotos, type PhotoSort } from "@/lib/openai/classify"
import { toEditError } from "@/lib/openai/edit"
import { DEFAULT_SHOTS } from "@/lib/shoot"
import { StoreError } from "@/lib/store/errors"

/**
 * Suggest how one product's photos group into colours and shots: `{ files: [{ fileId,
 * originalName }] }` → `{ name, productType, shots, photos: [{ fileId, originalName, image, color,
 * view }], warning? }`. Saves nothing; the owner reviews the suggestion and submits.
 */
export async function POST(request: Request) {
  try {
    const body = await readJson(request)
    const files = Array.isArray(body.files) ? body.files : []
    if (!files.length) throw new StoreError("invalid", "Add the product's photos")
    if (files.length > MAX_COMPLETED_PHOTOS) {
      throw new StoreError("invalid", `Up to ${MAX_COMPLETED_PHOTOS} photos at once`)
    }
    const shots = DEFAULT_SHOTS
    const photos = await readFiles(files)

    let name = ""
    let productType = ""
    let sorted: PhotoSort[]
    let warning: string | undefined
    try {
      const result = await sortProductPhotos(photos.map((p) => p.image))
      ;({ name, productType } = result)
      sorted = result.photos
    } catch (err) {
      // Still usable: everything lands in one colour for the owner to arrange.
      console.warn("[classify] sorting failed:", toEditError(err).message)
      warning = "Couldn't sort the photos automatically — please arrange them by colour."
      sorted = photos.map(() => ({ color: "Unsorted", view: shots[0].key }))
    }
    return Response.json({
      name,
      productType,
      shots,
      warning,
      photos: photos.map((p, i) => ({ ...p, ...sorted[i] })),
    })
  } catch (err) {
    return errorResponse(err)
  }
}
