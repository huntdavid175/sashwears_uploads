import { connection } from "next/server"

import { errorResponse, readJson } from "@/lib/api"
import { getUploadedFile } from "@/lib/imagekit"
import { StoreError } from "@/lib/store/errors"
import { addUploads, listUploads } from "@/lib/store/uploads"

const MAX_UPLOAD_BATCH = 100

export async function GET() {
  await connection()
  try {
    return Response.json(await listUploads())
  } catch (err) {
    return errorResponse(err)
  }
}

/**
 * Record a batch the browser already uploaded to ImageKit's inbox folder:
 * `{ note?, files: [{ fileId, originalName }] }`.
 */
export async function POST(request: Request) {
  try {
    const body = await readJson(request)
    const files = Array.isArray(body.files) ? body.files : []
    if (files.length === 0) throw new StoreError("invalid", "Add at least one photo")
    if (files.length > MAX_UPLOAD_BATCH) {
      throw new StoreError("invalid", `Up to ${MAX_UPLOAD_BATCH} photos at a time`)
    }
    const note =
      typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : undefined

    const checked = await Promise.all(
      files.map(async (f: { fileId?: unknown; originalName?: unknown }) => {
        if (typeof f?.fileId !== "string") throw new StoreError("invalid", "Missing fileId")
        const { size, name, ...image } = await getUploadedFile(f.fileId, { anyImage: true })
        const originalName =
          typeof f.originalName === "string" && f.originalName.trim()
            ? f.originalName.trim().slice(0, 200)
            : (name ?? "photo")
        return { originalName, image, sizeBytes: size }
      }),
    )
    return Response.json(await addUploads(note, checked), { status: 201 })
  } catch (err) {
    return errorResponse(err)
  }
}
