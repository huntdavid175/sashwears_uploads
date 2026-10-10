import { connection } from "next/server"

import { defined, errorResponse, readJson, templateInput } from "@/lib/api"
import { getStoredImage } from "@/lib/imagekit"
import { StoreError } from "@/lib/store/errors"
import { createTemplate, listTemplates } from "@/lib/store/templates"

export async function GET() {
  await connection()
  try {
    return Response.json(await listTemplates())
  } catch (err) {
    return errorResponse(err)
  }
}

/** Template fields plus `referenceFileId` of a background the browser uploaded to ImageKit. */
export async function POST(request: Request) {
  try {
    const body = await readJson(request)
    if (typeof body.referenceFileId !== "string") {
      throw new StoreError("invalid", "Reference image is required")
    }
    const reference = await getStoredImage(body.referenceFileId)
    const template = await createTemplate(defined(templateInput(body)), reference)
    return Response.json(template, { status: 201 })
  } catch (err) {
    return errorResponse(err)
  }
}
