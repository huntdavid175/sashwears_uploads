import "server-only"

import OpenAI, { APIConnectionError, APIError, toFile } from "openai"

import { extForFormat, MIME_BY_FORMAT, readImageInfo } from "@/lib/image"
import { MODEL_CAPS } from "@/lib/models"
import type { PhotoView, TemplateSettings } from "@/lib/types"

let client: OpenAI | undefined

export function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new EditError(
      "OPENAI_API_KEY is not set. Add it to .env.local and restart the dev server.",
    )
  }
  // Each job runs in one Vercel function capped at 300s, so there's no room for a second
  // attempt of a slow edit: fail fast and let the user retry.
  client ??= new OpenAI({ maxRetries: 0, timeout: 270 * 1000 })
  return client
}

export class EditError extends Error {
  name = "EditError"
}

/**
 * Framing that tells the model which image provides what. Template prompt is appended.
 * `view: "back"` stops the model "fixing" a back view into a front one.
 */
export function composePrompt(templatePrompt: string, view?: PhotoView) {
  return [
    "You are given two images.",
    ...(view === "back"
      ? [
          "Image 1 shows the BACK of the garment. Keep it a back view: do not turn the person around or invent a front.",
        ]
      : []),
    "Image 1 is the SUBJECT photo. Keep the subject (person and/or product) exactly as it is: same face, hair, body, pose, garment, fabric, texture, color, pattern, print, logos and any text on the product. Do not restyle, recolor or redesign the subject.",
    "Image 2 is the BACKGROUND REFERENCE. Replace the background of image 1 with the scene from image 2: same location, setting, props, materials, color palette, lighting direction and color grading. Adapt the scene's perspective and framing naturally around the subject, and add consistent shadows and reflections so the subject sits in the scene realistically.",
    "Return a single photorealistic image.",
    "",
    `Additional instructions: ${templatePrompt.trim()}`,
  ].join("\n")
}

export async function editImage(opts: {
  settings: TemplateSettings
  source: Buffer
  reference: Buffer
  size: string
  view?: PhotoView
}): Promise<Buffer> {
  const { settings } = opts
  const caps = MODEL_CAPS[settings.model]
  const source = await asUpload(opts.source, "source")
  const reference = await asUpload(opts.reference, "reference")

  try {
    const res = await getClient().images.edit({
      model: settings.model,
      image: [source, reference],
      prompt: composePrompt(settings.prompt, opts.view),
      quality: settings.quality,
      size: opts.size,
      output_format: settings.outputFormat,
      n: 1,
      ...(caps.inputFidelity === "omit" ? {} : { input_fidelity: caps.inputFidelity }),
    })
    const b64 = res.data?.[0]?.b64_json
    if (!b64) throw new EditError("OpenAI returned no image")
    return Buffer.from(b64, "base64")
  } catch (err) {
    throw toEditError(err)
  }
}

async function asUpload(data: Buffer, name: string) {
  const info = readImageInfo(data)
  if (!info) throw new EditError(`Unsupported ${name} image`)
  return toFile(data, `${name}.${extForFormat(info.format)}`, { type: MIME_BY_FORMAT[info.format] })
}

/** Turn SDK errors into a message the user can act on. */
export function toEditError(err: unknown): EditError {
  if (err instanceof EditError) return err
  if (err instanceof APIConnectionError) {
    return new EditError("Couldn't reach OpenAI (network error or timeout). Retry.")
  }
  if (err instanceof APIError) {
    const detail =
      err.error && typeof err.error === "object" && "message" in err.error
        ? String((err.error as { message: unknown }).message)
        : err.message
    switch (err.status) {
      case 401:
        return new EditError("OpenAI rejected the API key. Check OPENAI_API_KEY in .env.local.")
      case 403:
        return new EditError(`OpenAI denied access to this model: ${detail}`)
      case 429:
        return new EditError(`Rate limited or out of quota: ${detail}`)
      case 400:
        return new EditError(
          /safety|moderation|policy/i.test(detail)
            ? `Blocked by OpenAI's content policy: ${detail}`
            : `OpenAI rejected the request: ${detail}`,
        )
      default:
        return new EditError(`OpenAI error ${err.status ?? ""}: ${detail}`.trim())
    }
  }
  return new EditError(err instanceof Error ? err.message : String(err))
}
