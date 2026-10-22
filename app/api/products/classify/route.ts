import { errorResponse, readJson } from "@/lib/api"
import { MAX_COMPLETED_PHOTOS } from "@/lib/dress"
import { getStoredImage } from "@/lib/imagekit"
import { sortProductPhotos, type PhotoSort } from "@/lib/openai/classify"
import { toEditError } from "@/lib/openai/edit"
import { DEFAULT_SHOTS } from "@/lib/shoot"
import { StoreError } from "@/lib/store/errors"
import { getTemplate } from "@/lib/store/templates"

/**
 * Suggest how a product's photos group into colours and shots: `{ files: [{ fileId,
 * originalName }], templateId?, describe? }` → `{ name, productType, description, shots,
 * photos: [{ fileId, originalName, image, color, view }], warning? }`. With `templateId` the
 * photos are sorted into that template's shots (else DEFAULT_SHOTS); `describe` also writes a
 * shop description. Saves nothing; the owner reviews the suggestion and submits.
 */
export async function POST(request: Request) {
  try {
    const body = await readJson(request)
    const files = Array.isArray(body.files) ? body.files : []
    if (!files.length) throw new StoreError("invalid", "Add the product's photos")
    if (files.length > MAX_COMPLETED_PHOTOS) {
      throw new StoreError("invalid", `Up to ${MAX_COMPLETED_PHOTOS} photos at once`)
    }
    const shots =
      typeof body.templateId === "string"
        ? (await getTemplate(body.templateId)).shots.map(({ key, name }) => ({ key, name }))
        : DEFAULT_SHOTS
    if (!shots.length) throw new StoreError("invalid", "This template has no shots yet")
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
    let productType = ""
    let description = ""
    let sorted: PhotoSort[]
    let warning: string | undefined
    try {
      const result = await sortProductPhotos(
        photos.map((p) => p.image),
        { shots, describe: body.describe === true },
      )
      ;({ name, productType, description } = result)
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
      description,
      shots,
      warning,
      photos: photos.map((p, i) => ({ ...p, ...sorted[i] })),
    })
  } catch (err) {
    return errorResponse(err)
  }
}
