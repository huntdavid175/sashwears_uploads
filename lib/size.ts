import { MODEL_CAPS } from "@/lib/models"
import type { ModelId } from "@/lib/types"

const FIXED_SIZES = [
  [1024, 1024],
  [1536, 1024],
  [1024, 1536],
] as const

/** Flexible models: keep output between ~1MP and ~2.4MP, inside documented limits. */
const MIN_AREA = 1024 * 1024
const MAX_AREA = 1536 * 1536
const MAX_EDGE = 2560 // larger is "experimental" per the API docs
const MIN_RATIO = 1 / 3
const MAX_RATIO = 3

/** Pick the supported output size closest to the source image's aspect ratio. */
export function pickSize(model: ModelId, width: number, height: number): string {
  const ratio = width / height

  if (MODEL_CAPS[model].sizing === "fixed") {
    const [w, h] = FIXED_SIZES.reduce((best, cand) =>
      Math.abs(Math.log(cand[0] / cand[1] / ratio)) < Math.abs(Math.log(best[0] / best[1] / ratio))
        ? cand
        : best,
    )
    return `${w}x${h}`
  }

  const r = Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio))
  const area = Math.min(MAX_AREA, Math.max(MIN_AREA, width * height))
  let w = Math.sqrt(area * r)
  let h = w / r
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h))
  w *= scale
  h *= scale
  let W = to16(w)
  let H = to16(h)
  // Rounding can nudge an extreme ratio just past the API's 3:1 limit.
  while (W / H > MAX_RATIO) H += 16
  while (H / W > MAX_RATIO) W += 16
  return `${W}x${H}`
}

function to16(n: number) {
  // Round up so the minimum area is never undershot.
  return Math.max(16, Math.ceil(n / 16) * 16)
}
