import "server-only"

import { normalizeProductType } from "@/lib/dress"
import { DEFAULT_SHOTS, MAX_DESCRIPTION } from "@/lib/shoot"
import type { PhotoView, Shot, StoredImage } from "@/lib/types"

import { getClient } from "./edit"
import { cleanName, NAMING_MODEL } from "./name"

export type PhotoSort = { color: string; view: PhotoView }

export type ProductSort = {
  /** Product name without colour; "" if the model gave none. */
  name: string
  /** What it is, e.g. "Dress" or "Tote Bag"; "" if unsure. */
  productType: string
  /** Shop description, when asked for (`describe`); "" otherwise. */
  description: string
  /** One entry per input photo, in the same order. */
  photos: PhotoSort[]
}

const PROMPT = (count: number, shots: Shot[], describe: boolean) =>
  [
    `These ${count} photos (numbered 1 to ${count} in the order given) show ONE product for an`,
    "online fashion shop (it could be clothing, a bag, shoes, jewelry or another accessory),",
    "possibly in several colors, photographed from different sides.",
    "For every photo give: the color of the product as a short retail color name in Title Case",
    '(e.g. "Black", "Wine", "Emerald Green") — use exactly the same name for every photo of the same',
    "color — and which shot it shows, one of: " +
      shots.map((s) => `"${s.key}" (${s.name})`).join(", ") +
      ". Pick the closest shot when none fits exactly.",
    "Also name the product for the catalog without any color: 2 to 5 words in Title Case, material",
    'or pattern, then style, ending with the product type, e.g. "Satin Wrap Midi Dress" or',
    '"Woven Raffia Tote Bag". And give the product type alone in Title Case, e.g. "Dress", "Tote Bag".',
    ...(describe
      ? [
          "Also write a product description for the shop: 2 to 4 plain sentences on the shape, cut,",
          "fit, material look and details you can see, and what it suits. Mention that it comes in",
          "the colors you found. Do not guess fabric content, sizes, dimensions or care. No emoji,",
          "no hype.",
        ]
      : []),
  ].join(" ")

function schema(shots: Shot[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["name", "productType", "description", "photos"],
    properties: {
      name: { type: "string" },
      productType: { type: "string" },
      description: { type: "string", description: '"" unless a description was asked for' },
      photos: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["photo", "color", "view"],
          properties: {
            photo: { type: "integer", description: "The photo's number, starting at 1" },
            color: { type: "string" },
            view: { type: "string", enum: shots.map((s) => s.key) },
          },
        },
      },
    },
  }
}

/** A small JPEG of the photo: enough to judge color and side, cheap to send. */
function preview(image: StoredImage) {
  const url = new URL(image.url)
  url.search = ""
  url.searchParams.set("tr", "w-768,f-jpg")
  return url.toString()
}

/**
 * Ask the vision model to sort a product's photos by color and shot (the template's shots, or
 * DEFAULT_SHOTS). A suggestion only: the store owner reviews it. Photos the model skips come
 * back as "Unsorted", in the first shot.
 */
export async function sortProductPhotos(
  images: StoredImage[],
  opts: { shots?: Shot[]; describe?: boolean } = {},
): Promise<ProductSort> {
  const shots = opts.shots?.length ? opts.shots : DEFAULT_SHOTS
  const res = await getClient().responses.create({
    model: NAMING_MODEL,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: PROMPT(images.length, shots, Boolean(opts.describe)) },
          ...images.map((image) => ({
            type: "input_image" as const,
            detail: "low" as const,
            image_url: preview(image),
          })),
        ],
      },
    ],
    text: {
      format: { type: "json_schema", name: "product_photos", schema: schema(shots), strict: true },
    },
  })
  const parsed = JSON.parse(res.output_text) as {
    name: string
    productType: string
    description: string
    photos: { photo: number; color: string; view: PhotoView }[]
  }
  const byPhoto = new Map(parsed.photos.map((p) => [p.photo, p]))
  const keys = new Set(shots.map((s) => s.key))
  return {
    name: cleanName(parsed.name ?? ""),
    productType: normalizeProductType(cleanName(parsed.productType ?? "")),
    description: opts.describe ? cleanDescription(parsed.description ?? "") : "",
    photos: images.map((_, i) => {
      const p = byPhoto.get(i + 1)
      const color = cleanName(p?.color ?? "").slice(0, 40)
      return {
        color: color || "Unsorted",
        view: p && keys.has(p.view) ? p.view : shots[0].key,
      }
    }),
  }
}

/** One paragraph of plain text, capped. */
export function cleanDescription(raw: string) {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_DESCRIPTION).trim()
}
