import "server-only"

import { DEFAULT_SIZES, normalizeProductType, normalizeTags, ONE_SIZE } from "@/lib/dress"
import { StoreError } from "@/lib/store/errors"

import { getClient } from "./edit"
import { cleanName, NAMING_MODEL } from "./name"

export type ProductDetails = {
  /** In size order; empty for a one-size product. */
  sizes: string[]
  /** Stock by colour, then size. Anything not listed is 0. */
  quantities: Record<string, Record<string, number>>
  tags: string[]
  productType: string
}

type Reply = {
  entries: { color: string; size: string; quantity: number }[]
  unknownColors: string[]
  tags: string[]
  productType: string
}

const SIZE_WORDS: Record<string, string> = {
  "extra small": "XS",
  small: "S",
  medium: "M",
  large: "L",
  "extra large": "XL",
  "extra extra large": "XXL",
}

const SIZE_ORDER = ["XS", ...DEFAULT_SIZES]

/** "small" → "S", "xl" → "XL"; anything else ("38", "One Size") as written. */
function sizeLabel(raw: string) {
  const size = raw.replace(/\s+/g, " ").trim().slice(0, 40)
  const lower = size.toLowerCase()
  if (SIZE_WORDS[lower]) return SIZE_WORDS[lower]
  return SIZE_ORDER.includes(size.toUpperCase()) ? size.toUpperCase() : size
}

const sizeRank = (size: string) => {
  const i = SIZE_ORDER.indexOf(size)
  return i === -1 ? SIZE_ORDER.length : i
}

/**
 * The model's reading of the stock, checked: every colour is one with images, and the sizes are
 * either all given or all left out. Repeats add up; a colour mentioned that has no images is
 * dropped, since it won't be on the product.
 */
export function toStock(
  reply: Pick<Reply, "entries" | "unknownColors">,
  colors: { all: string[]; finished: string[] },
): Pick<ProductDetails, "sizes" | "quantities"> {
  const unknown = reply.unknownColors.map((c) => cleanName(c)).filter(Boolean)
  if (unknown.length) {
    throw new StoreError(
      "invalid",
      `No ${unknown.join(", ")} here. Its colours are ${colors.all.join(", ")}.`,
    )
  }
  const entries = reply.entries
    .filter((e) => colors.finished.includes(e.color))
    .map((e) => ({ ...e, size: sizeLabel(e.size) }))
  const noSize = entries.find((e) => !e.size)
  if (noSize && entries.some((e) => e.size)) {
    throw new StoreError("invalid", `Say which size ${noSize.color} is.`)
  }

  const quantities: ProductDetails["quantities"] = {}
  const sizes: string[] = []
  for (const { color, size, quantity } of entries) {
    if (size && !sizes.includes(size)) sizes.push(size)
    const stock = (quantities[color] ??= {})
    const key = size || ONE_SIZE
    stock[key] = (stock[key] ?? 0) + Math.max(0, Math.trunc(quantity))
  }
  return { sizes: sizes.sort((a, b) => sizeRank(a) - sizeRank(b)), quantities }
}

const PROMPT = (input: { name: string; description: string; colors: string[]; stock: string }) =>
  [
    `A shop owner is listing "${input.name}" in these colors: ${input.colors.join(", ")}.`,
    input.description && `It is described as: ${input.description}`,
    input.stock
      ? [
          "Below, after STOCK, the owner wrote how many they have, in their own words. Turn it into",
          "entries of color, size and quantity. color is one of the listed colors: match case,",
          'spelling slips and obvious shorthand ("blk" is Black), but never swap a color for a',
          "different one. A color that matches none goes in unknownColors, as written. size is the",
          'size as written, "" if none is given. Never invent stock that was not written.',
        ].join(" ")
      : "There is no stock to read: entries and unknownColors stay empty.",
    "Also give 3 to 8 lowercase shop search tags on style, occasion, material and season, using",
    "letters, numbers and hyphens, without colors or sizes. And the product type alone in Title",
    'Case, e.g. "Dress", "Tote Bag".',
    input.stock && `STOCK: ${input.stock}`,
  ]
    .filter(Boolean)
    .join(" ")

function schema(colors: string[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["entries", "unknownColors", "tags", "productType"],
    properties: {
      entries: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["color", "size", "quantity"],
          properties: {
            color: { type: "string", enum: colors },
            size: { type: "string" },
            quantity: { type: "integer" },
          },
        },
      },
      unknownColors: { type: "array", items: { type: "string" } },
      tags: { type: "array", items: { type: "string" } },
      productType: { type: "string" },
    },
  }
}

/** Read the owner's stock note (may be empty) and suggest tags and a product type. */
export async function arrangeProduct(input: {
  name: string
  description: string
  colors: { all: string[]; finished: string[] }
  stock: string
}): Promise<ProductDetails> {
  const res = await getClient().responses.create(
    {
      model: NAMING_MODEL,
      input: PROMPT({ ...input, colors: input.colors.all }),
      text: {
        format: {
          type: "json_schema",
          name: "product_details",
          schema: schema(input.colors.all),
          strict: true,
        },
      },
    },
    { maxRetries: 1, timeout: 60 * 1000 },
  )
  const reply = JSON.parse(res.output_text) as Reply
  return {
    ...toStock(input.stock ? reply : { entries: [], unknownColors: [] }, input.colors),
    tags: normalizeTags(reply.tags),
    productType: normalizeProductType(cleanName(reply.productType ?? "")),
  }
}
