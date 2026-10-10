import { errorResponse } from "@/lib/api"
import { uploadAuth } from "@/lib/imagekit"

/** One-time signature for a direct browser → ImageKit upload. `?kind=sources|references` */
export async function GET(request: Request) {
  const kind = new URL(request.url).searchParams.get("kind")
  try {
    const auth = uploadAuth(kind === "references" ? "references" : "sources")
    return Response.json(auth, { headers: { "Cache-Control": "no-store" } })
  } catch (err) {
    return errorResponse(err)
  }
}
