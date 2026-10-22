import { connection } from "next/server"

import { defined, errorResponse, readJson, templateImages, templateInput } from "@/lib/api"
import { createTemplate, listTemplates } from "@/lib/store/templates"

export async function GET() {
  await connection()
  try {
    return Response.json(await listTemplates())
  } catch (err) {
    return errorResponse(err)
  }
}

/**
 * Template fields (`name`, `kind`: "model" | "scene", `prompt`, model settings) plus
 * `shots: [{ name, fileId }]`, each a reference photo the browser uploaded to ImageKit.
 */
export async function POST(request: Request) {
  try {
    const body = await readJson(request)
    const template = await createTemplate(defined(templateInput(body)), await templateImages(body))
    return Response.json(template, { status: 201 })
  } catch (err) {
    return errorResponse(err)
  }
}
