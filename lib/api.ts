import "server-only"

import { after } from "next/server"

import { StoreError } from "@/lib/store/errors"
import type { TemplateInput } from "@/lib/store/templates"

const STATUS: Record<StoreError["code"], number> = {
  invalid: 400,
  not_found: 404,
  conflict: 409,
}

export function errorResponse(err: unknown) {
  if (err instanceof StoreError) {
    return Response.json({ error: err.message }, { status: STATUS[err.code] })
  }
  console.error(err)
  const message = err instanceof Error && err.name === "UploadError" ? err.message : null
  return Response.json(
    { error: message ?? "Something went wrong. Check the server logs." },
    { status: 500 },
  )
}

export const MAX_BATCH = 20

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object") throw new StoreError("invalid", "Expected a JSON body")
  return body as Record<string, unknown>
}

/** Pull template fields out of a body; absent fields stay undefined so updates are partial. */
export function templateInput(body: Record<string, unknown>): TemplateInput {
  const str = (key: string) => (typeof body[key] === "string" ? (body[key] as string) : undefined)
  return {
    name: str("name"),
    prompt: str("prompt"),
    model: str("model") as TemplateInput["model"],
    quality: str("quality") as TemplateInput["quality"],
    outputFormat: str("outputFormat") as TemplateInput["outputFormat"],
  }
}

/** Drop undefined keys so `{...current, ...input}` doesn't clobber existing values. */
export function defined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>
}

/**
 * After the response is sent, start `times` worker invocations (each runs one queued job).
 * `origin` must be read from the request before any try/catch — see AGENTS.md.
 */
export function kickWorkerAfter(origin: string, times = 1) {
  after(() => kickWorker(origin, times))
}

export async function kickWorker(origin: string, times = 1) {
  const headers = new Headers()
  // Lets the call through Vercel Deployment Protection on preview deployments.
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  if (bypass) headers.set("x-vercel-protection-bypass", bypass)
  await Promise.all(
    Array.from({ length: times }, () =>
      fetch(`${origin}/api/worker`, { method: "POST", headers })
        .then((res) => {
          if (!res.ok) console.warn(`[worker] kick returned HTTP ${res.status}`)
        })
        .catch((err) => console.warn("[worker] kick failed:", (err as Error).message)),
    ),
  )
}
