import { errorResponse } from "@/lib/api"
import { uploadAuth, type UploadKind } from "@/lib/imagekit"

const KINDS: UploadKind[] = ["sources", "references", "inbox"]

/** One-time signature for a direct browser → ImageKit upload. `?kind=sources|references|inbox` */
export async function GET(request: Request) {
  const kind = new URL(request.url).searchParams.get("kind") as UploadKind
  try {
    const auth = uploadAuth(KINDS.includes(kind) ? kind : "sources")
    return Response.json(auth, { headers: { "Cache-Control": "no-store" } })
  } catch (err) {
    return errorResponse(err)
  }
}
