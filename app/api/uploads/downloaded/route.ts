import { errorResponse, readJson } from "@/lib/api"
import { markDownloaded } from "@/lib/store/uploads"

/** `{ ids }`: mark inbox photos as downloaded, so new ones stand out. */
export async function POST(request: Request) {
  try {
    const body = await readJson(request)
    const ids = Array.isArray(body.ids) ? body.ids.filter((x) => typeof x === "string") : []
    await markDownloaded(ids)
    return new Response(null, { status: 204 })
  } catch (err) {
    return errorResponse(err)
  }
}
