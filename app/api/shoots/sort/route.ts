import { errorResponse, readFiles, readJson } from "@/lib/api"
import { sortBatchPhotos, type BatchProduct } from "@/lib/openai/classify"
import { toEditError } from "@/lib/openai/edit"
import { MAX_BATCH_PHOTOS } from "@/lib/shoot"
import { StoreError } from "@/lib/store/errors"
import { getTemplate } from "@/lib/store/templates"

/** A big upload is one slow vision call, tried up to twice. */
export const maxDuration = 300

/**
 * Suggest how a mixed upload groups into products, colours and the template's shots: `{
 * templateId, files: [{ fileId, originalName }] }` → `{ warning?, products: [{ name, productType,
 * tags, description, photos: [{ fileId, originalName, image, color, view }] }] }`. Saves nothing; the
 * owner reviews the suggestion and submits.
 */
export async function POST(request: Request) {
  try {
    const body = await readJson(request)
    const files = Array.isArray(body.files) ? body.files : []
    if (!files.length) throw new StoreError("invalid", "Add the product photos")
    if (files.length > MAX_BATCH_PHOTOS) {
      throw new StoreError("invalid", `Up to ${MAX_BATCH_PHOTOS} photos at once`)
    }
    if (typeof body.templateId !== "string") throw new StoreError("invalid", "Pick a template")
    const { shots } = await getTemplate(body.templateId)
    if (!shots.length) throw new StoreError("invalid", "This template has no shots yet")
    const photos = await readFiles(files)

    let sorted: BatchProduct[]
    let warning: string | undefined
    try {
      sorted = await sortBatchPhotos(
        photos.map((p) => p.image),
        shots.map(({ key, name }) => ({ key, name })),
      )
    } catch (err) {
      // Still usable: everything lands in one product for the owner to arrange.
      console.warn("[sort] sorting failed:", toEditError(err).message)
      warning = "Couldn't sort the photos automatically — please arrange them by product."
      sorted = [
        {
          name: "",
          productType: "",
          tags: [],
          description: "",
          photos: photos.map((_, index) => ({ index, color: "Unsorted", view: shots[0].key })),
        },
      ]
    }
    return Response.json({
      warning,
      products: sorted.map(({ photos: list, ...product }) => ({
        ...product,
        photos: list.map(({ index, ...sort }) => ({ ...photos[index], ...sort })),
      })),
    })
  } catch (err) {
    return errorResponse(err)
  }
}
