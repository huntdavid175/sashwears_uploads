import { errorResponse } from "@/lib/api"
import { deleteImage, toUploadError } from "@/lib/imagekit"
import { deleteUpload } from "@/lib/store/uploads"

/** Delete a photo from the inbox and from ImageKit. */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/uploads/[id]">) {
  try {
    const { id } = await ctx.params
    const upload = await deleteUpload(id)
    await deleteImage(upload.image.fileId).catch((err) =>
      console.warn("[uploads] couldn't delete ImageKit file:", toUploadError(err).message),
    )
    return new Response(null, { status: 204 })
  } catch (err) {
    return errorResponse(err)
  }
}
