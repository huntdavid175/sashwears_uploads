import type { ModelId, Quality } from "@/lib/types"

/**
 * Per-model capabilities and prices. Source: OpenAI SDK 7.30 ImageEditParams docs and
 * developers.openai.com/api/docs/pricing (checked 2026-10-07). Update when models change.
 */
export type ModelCaps = {
  label: string
  qualities: readonly Quality[]
  /** What to send as `input_fidelity`; "omit" = model always uses high fidelity / rejects param. */
  inputFidelity: "high" | "low" | "omit"
  /** "fixed" = only 1024x1024 / 1536x1024 / 1024x1536; "flexible" = any WxH (multiples of 16). */
  sizing: "fixed" | "flexible"
  /** USD per 1M image tokens. */
  price: { imageInput: number; imageOutput: number }
  note?: string
}

const BASE_QUALITIES = ["low", "medium", "high"] as const
const EXTENDED_QUALITIES = ["low", "medium", "high", "xhigh", "max"] as const

export const MODEL_CAPS: Record<ModelId, ModelCaps> = {
  "gpt-image-1": {
    label: "GPT Image 1",
    qualities: BASE_QUALITIES,
    inputFidelity: "high",
    sizing: "fixed",
    price: { imageInput: 10, imageOutput: 40 },
  },
  "gpt-image-1-mini": {
    label: "GPT Image 1 Mini",
    qualities: BASE_QUALITIES,
    inputFidelity: "low",
    sizing: "fixed",
    price: { imageInput: 2.5, imageOutput: 8 },
    note: "Cheapest, but only supports low input fidelity — product details may drift.",
  },
  "gpt-image-1.5": {
    label: "GPT Image 1.5",
    qualities: BASE_QUALITIES,
    inputFidelity: "high",
    sizing: "fixed",
    price: { imageInput: 8, imageOutput: 32 },
  },
  "gpt-image-2": {
    label: "GPT Image 2",
    qualities: BASE_QUALITIES,
    inputFidelity: "omit",
    sizing: "flexible",
    price: { imageInput: 8, imageOutput: 30 },
  },
  "gpt-image-2.5-sunburst": {
    label: "GPT Image 2.5 Sunburst",
    qualities: EXTENDED_QUALITIES,
    inputFidelity: "omit",
    sizing: "flexible",
    price: { imageInput: 8, imageOutput: 30 },
  },
  "gpt-image-2.5-flare": {
    label: "GPT Image 2.5 Flare",
    qualities: EXTENDED_QUALITIES,
    inputFidelity: "omit",
    sizing: "flexible",
    price: { imageInput: 8, imageOutput: 30 },
  },
}

/**
 * Output image tokens for a 1024x1024 image, from the published GPT Image per-image
 * prices (e.g. gpt-image-1.5 high 1024² = $0.133 at $32/1M ≈ 4160 tokens).
 * xhigh/max aren't published per image; these are guesses.
 */
const OUTPUT_TOKENS_1MP: Record<Quality, number> = {
  low: 272,
  medium: 1056,
  high: 4160,
  xhigh: 6240,
  max: 8320,
}

/** Rough input cost per input image. Not published per image; a guess. */
const INPUT_TOKENS_PER_IMAGE = 1500

/** Rough USD estimate for one edit at the given size, from `inputImages` images (default 2). */
export function estimateCost(model: ModelId, quality: Quality, size: string, inputImages = 2) {
  const caps = MODEL_CAPS[model]
  const [w, h] = size.split("x").map(Number)
  const areaFactor = (w * h) / (1024 * 1024)
  const outputTokens = OUTPUT_TOKENS_1MP[quality] * areaFactor
  const inputTokens = INPUT_TOKENS_PER_IMAGE * inputImages
  return (outputTokens * caps.price.imageOutput + inputTokens * caps.price.imageInput) / 1_000_000
}
