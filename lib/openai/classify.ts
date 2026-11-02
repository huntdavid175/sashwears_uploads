import "server-only"

import { normalizeProductType, normalizeTags } from "@/lib/dress"
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
  /** One entry per input photo, in the same order. */
  photos: PhotoSort[]
}

/** One product found in a mixed upload. */
export type BatchProduct = {
  /** "" for the photos the model left unplaced, which the owner has to file. */
  name: string
  /** What it is, e.g. "Dress" or "Tote Bag"; "" if unsure. */
  productType: string
  tags: string[]
  description: string
  /** `index` is the photo's position in the input. */
  photos: (PhotoSort & { index: number })[]
}

const NAMING = [
  "2 to 5 words in Title Case, material or pattern, then style, ending with the product type,",
  'e.g. "Satin Wrap Midi Dress" or "Woven Raffia Tote Bag".',
].join(" ")

const COLOR = [
  "the color of the product as a short retail color name in Title Case",
  '(e.g. "Black", "Wine", "Emerald Green")',
].join(" ")

const listShots = (shots: Shot[]) =>
  shots.map((s) => `"${s.key}" (${s.name})`).join(", ") + ". Pick the closest shot when none fits."

const PROMPT = (count: number, shots: Shot[]) =>
  [
    `These ${count} photos (numbered 1 to ${count} in the order given) show ONE product for an`,
    "online fashion shop (it could be clothing, a bag, shoes, jewelry or another accessory),",
    "possibly in several colors, photographed from different sides.",
    `For every photo give: ${COLOR} — use exactly the same name for every photo of the same`,
    `color — and which shot it shows, one of: ${listShots(shots)}`,
    `Also name the product for the catalog without any color: ${NAMING}`,
    'And give the product type alone in Title Case, e.g. "Dress", "Tote Bag".',
  ].join(" ")

const BATCH_PROMPT = (count: number, shots: Shot[]) =>
  [
    `These ${count} photos (numbered 1 to ${count} in the order given) were taken for an online`,
    "fashion shop and mixed together: they show SEVERAL DIFFERENT products (clothing, bags, shoes,",
    "jewelry or other accessories), each possibly in several colors, from different sides.",
    "First work out which photos show the same product. The same product means the same design:",
    "same cut, silhouette, neckline, sleeves, length, seams, closures, hardware. The same design in",
    "another color is the SAME product, never a new one. A similar item with a different design is",
    "a DIFFERENT product, even in the same color. Match each back or side view to its product by",
    "color, fabric, cut and hem; never make a separate product just because a photo shows the back.",
    `List the products, numbered from 1. For each: a catalog name without any color: ${NAMING}`,
    'The product type alone in Title Case, e.g. "Dress", "Tote Bag".',
    "3 to 8 lowercase shop search tags on style, occasion, material and season, using letters,",
    "numbers and hyphens, without colors or sizes.",
    "And a description for the shop: 2 to 4 plain sentences on the shape, cut, fit, material look",
    "and details you can see, and what it suits, mentioning the colors it comes in. Do not guess",
    "fabric content, sizes, dimensions or care. No emoji, no hype.",
    "Then for EVERY photo, exactly once: its product's number,",
    `${COLOR} — exactly the same name for every photo of that color of that product — and which`,
    `shot it shows, one of: ${listShots(shots)}`,
  ].join(" ")

const photoEntry = (shots: Shot[], extra: Record<string, object> = {}) => ({
  type: "object",
  additionalProperties: false,
  required: ["photo", ...Object.keys(extra), "color", "view"],
  properties: {
    photo: { type: "integer", description: "The photo's number, starting at 1" },
    ...extra,
    color: { type: "string" },
    view: { type: "string", enum: shots.map((s) => s.key) },
  },
})

function schema(shots: Shot[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["name", "productType", "photos"],
    properties: {
      name: { type: "string" },
      productType: { type: "string" },
      photos: { type: "array", items: photoEntry(shots) },
    },
  }
}

function batchSchema(shots: Shot[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["products", "photos"],
    properties: {
      products: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "productType", "tags", "description"],
          properties: {
            name: { type: "string" },
            productType: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
            description: { type: "string" },
          },
        },
      },
      photos: {
        type: "array",
        items: photoEntry(shots, {
          product: { type: "integer", description: "The product's number, starting at 1" },
        }),
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

/** The sort's user message: the instructions, then the photos in order. */
function sortInput(text: string, images: StoredImage[], detail: "low" | "high") {
  return [
    {
      role: "user" as const,
      content: [
        { type: "input_text" as const, text },
        ...images.map((image) => ({
          type: "input_image" as const,
          detail,
          image_url: preview(image),
        })),
      ],
    },
  ]
}

function sortedPhoto(
  reply: { color?: string; view?: PhotoView } | undefined,
  shots: Shot[],
): PhotoSort {
  const color = cleanName(reply?.color ?? "").slice(0, 40)
  const known = shots.some((s) => s.key === reply?.view)
  return { color: color || "Unsorted", view: known ? reply!.view! : shots[0].key }
}

/**
 * Ask the vision model to sort one product's photos by color and shot (DEFAULT_SHOTS). A
 * suggestion only: the store owner reviews it. Photos the model skips come back as "Unsorted",
 * in the first shot.
 */
export async function sortProductPhotos(images: StoredImage[]): Promise<ProductSort> {
  const shots = DEFAULT_SHOTS
  const res = await getClient().responses.create({
    model: NAMING_MODEL,
    input: sortInput(PROMPT(images.length, shots), images, "low"),
    text: {
      format: { type: "json_schema", name: "product_photos", schema: schema(shots), strict: true },
    },
  })
  const parsed = JSON.parse(res.output_text) as {
    name: string
    productType: string
    photos: { photo: number; color: string; view: PhotoView }[]
  }
  const byPhoto = new Map(parsed.photos.map((p) => [p.photo, p]))
  return {
    name: cleanName(parsed.name ?? ""),
    productType: normalizeProductType(cleanName(parsed.productType ?? "")),
    photos: images.map((_, i) => sortedPhoto(byPhoto.get(i + 1), shots)),
  }
}

type BatchReply = {
  products: { name: string; productType: string; tags: string[]; description: string }[]
  photos: { photo: number; product: number; color: string; view: PhotoView }[]
}

/** The model's answer as products with their photos; what it left unplaced goes in a last one. */
export function toBatchProducts(reply: BatchReply, count: number, shots: Shot[]): BatchProduct[] {
  const products: BatchProduct[] = reply.products.map((p) => ({
    name: cleanName(p.name ?? ""),
    productType: normalizeProductType(cleanName(p.productType ?? "")),
    tags: normalizeTags(p.tags),
    description: cleanDescription(p.description ?? ""),
    photos: [],
  }))
  const unplaced: BatchProduct = {
    name: "",
    productType: "",
    tags: [],
    description: "",
    photos: [],
  }
  const byPhoto = new Map(reply.photos.map((p) => [p.photo, p]))
  for (let index = 0; index < count; index++) {
    const p = byPhoto.get(index + 1)
    const product = (p && products[p.product - 1]) ?? unplaced
    product.photos.push({ index, ...sortedPhoto(p, shots) })
  }
  return [...products, unplaced].filter((p) => p.photos.length)
}

/**
 * Ask the vision model to sort a mixed upload into products, and each product's photos by color
 * and the template's shots, with a name and description per product. A suggestion only: the
 * store owner reviews it. Sharper previews than a single product needs: it must tell designs
 * apart, and that's small next to what generating them costs.
 */
export async function sortBatchPhotos(
  images: StoredImage[],
  shots: Shot[],
): Promise<BatchProduct[]> {
  const res = await getClient().responses.create(
    {
      model: NAMING_MODEL,
      input: sortInput(BATCH_PROMPT(images.length, shots), images, "high"),
      text: {
        format: {
          type: "json_schema",
          name: "batch_photos",
          schema: batchSchema(shots),
          strict: true,
        },
      },
    },
    // Unlike an edit this fits a second try, and a re-sort beats filing every photo by hand.
    { maxRetries: 1, timeout: 130 * 1000 },
  )
  return toBatchProducts(JSON.parse(res.output_text), images.length, shots)
}

/** One paragraph of plain text, capped. */
export function cleanDescription(raw: string) {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_DESCRIPTION).trim()
}
