import "server-only"

import type { PhotoView, StoredImage } from "@/lib/types"

import { getClient } from "./edit"
import { cleanName, NAMING_MODEL } from "./name"

export type PhotoSort = { color: string; view: PhotoView }

export type DressSort = {
  /** Product name without colour; "" if the model gave none. */
  name: string
  /** One entry per input photo, in the same order. */
  photos: PhotoSort[]
}

const PROMPT = (count: number) =>
  [
    `These ${count} photos (numbered 1 to ${count} in the order given) show ONE dress for an online`,
    "shop, possibly in several colors, photographed from the front and sometimes the back.",
    "For every photo give: the color of the dress as a short retail color name in Title Case",
    '(e.g. "Black", "Wine", "Emerald Green") — use exactly the same name for every photo of the same',
    'color — and whether it shows the "front" or the "back" of the dress.',
    "Also name the dress for the catalog without any color: 2 to 5 words in Title Case, fabric or",
    'pattern, then silhouette or style, ending with the garment type, e.g. "Satin Wrap Midi Dress".',
  ].join(" ")

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "photos"],
  properties: {
    name: { type: "string" },
    photos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["photo", "color", "view"],
        properties: {
          photo: { type: "integer", description: "The photo's number, starting at 1" },
          color: { type: "string" },
          view: { type: "string", enum: ["front", "back"] },
        },
      },
    },
  },
} as const

/** A small JPEG of the photo: enough to judge color and side, cheap to send. */
function preview(image: StoredImage) {
  const url = new URL(image.url)
  url.search = ""
  url.searchParams.set("tr", "w-768,f-jpg")
  return url.toString()
}

/**
 * Ask the vision model to sort a finished dress's photos by color and side. A suggestion only:
 * the store owner reviews it. Photos the model skips come back as "Unsorted" fronts.
 */
export async function sortDressPhotos(images: StoredImage[]): Promise<DressSort> {
  const res = await getClient().responses.create({
    model: NAMING_MODEL,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: PROMPT(images.length) },
          ...images.map((image) => ({
            type: "input_image" as const,
            detail: "low" as const,
            image_url: preview(image),
          })),
        ],
      },
    ],
    text: { format: { type: "json_schema", name: "dress_photos", schema: SCHEMA, strict: true } },
  })
  const parsed = JSON.parse(res.output_text) as {
    name: string
    photos: { photo: number; color: string; view: PhotoView }[]
  }
  const byPhoto = new Map(parsed.photos.map((p) => [p.photo, p]))
  return {
    name: cleanName(parsed.name ?? ""),
    photos: images.map((_, i) => {
      const p = byPhoto.get(i + 1)
      const color = cleanName(p?.color ?? "").slice(0, 40)
      return { color: color || "Unsorted", view: p?.view === "back" ? "back" : "front" }
    }),
  }
}
