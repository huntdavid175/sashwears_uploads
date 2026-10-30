import { stockSizes } from "@/lib/dress"
import { shotKey } from "@/lib/shoot"
import type { Product, StoredImage } from "@/lib/types"

/**
 * Shopify product CSV (the "URL handle" / "Inventory quantity" format), checked against
 * Shopify's product_template.csv on 2026-10-30. Only the columns we fill are included, in the
 * template's order; Shopify accepts a subset as long as "Title" is present.
 *
 * Layout per product: one row per Color × Size variant (Option1 = Color, Option2 = Size; just
 * Color for one-size products), the first row also carries the product fields and option names.
 * Product images go on rows by position (extra rows hold only the handle and image when there
 * are more images than variants). Each colour's first finished photo (its front, usually) is that
 * colour's variant image. Products import as drafts. Limits from Shopify's guide: SEO title 70
 * characters, SEO description 320, alt text best under 125.
 */
export const SHOPIFY_COLUMNS = [
  "Title",
  "URL handle",
  "Description",
  "Type",
  "Tags",
  "Published on online store",
  "Status",
  "SKU",
  "Option1 name",
  "Option1 value",
  "Option2 name",
  "Option2 value",
  "Price",
  "Inventory tracker",
  "Inventory quantity",
  "Continue selling when out of stock",
  "Requires shipping",
  "Product image URL",
  "Image position",
  "Image alt text",
  "Variant image URL",
  "SEO title",
  "SEO description",
] as const

type Column = (typeof SHOPIFY_COLUMNS)[number]
type Row = Partial<Record<Column, string | number>>

const MAX_SEO_TITLE = 70
const MAX_SEO_DESCRIPTION = 320

/** Cut at a word, never mid-word. */
function shorten(text: string, max: number) {
  if (text.length <= max) return text
  const cut = text.slice(0, max + 1)
  return cut.slice(0, cut.lastIndexOf(" ")).trim()
}

/** "front" → "Front", "three-quarter" → "Three quarter". */
function shotLabel(view: string) {
  const words = view.replace(/-/g, " ")
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** Unique per variant: the handle is, and a product's colours and sizes are. */
function variantSku(handle: string, color: string, size?: string) {
  return [handle, shotKey(color), ...(size ? [shotKey(size)] : [])].join("-").toUpperCase()
}

/** Shopify reads the description as HTML; ours is plain text. */
function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/** Original file from ImageKit (Shopify re-hosts it on import). */
function original(image: StoredImage) {
  const url = new URL(image.url)
  url.search = ""
  url.searchParams.set("tr", "orig-true")
  return url.toString()
}

/** Throws if a product isn't ready to export (unnamed or missing results). */
export function assertExportable(product: Product) {
  const label = product.name ?? "A product"
  if (!product.name || !product.handle) throw new Error(`${label} hasn't been named yet`)
  if (product.status !== "ready")
    throw new Error(`${label} is still generating or has failed photos`)
  for (const color of product.colors) {
    if (!color.photos.some((p) => p.output)) {
      throw new Error(`${label}: ${color.name} has no finished photo`)
    }
  }
}

export function productRows(product: Product): Row[] {
  assertExportable(product)
  const handle = product.handle!
  const images = product.colors.flatMap((color) =>
    color.photos
      .filter((p) => p.output)
      .map((p) => ({
        url: original(p.output!),
        alt: `${product.name} in ${color.name}, ${shotLabel(p.view).toLowerCase()} view`,
      })),
  )

  const sized = product.sizes.length > 0
  const variants: Row[] = product.colors.flatMap((color) => {
    const cover = color.photos.find((p) => p.output)!.output!
    return stockSizes(product.sizes).map((size) => ({
      "URL handle": handle,
      SKU: variantSku(handle, color.name, sized ? size : undefined),
      "Option1 value": color.name,
      "Option2 value": sized ? size : undefined,
      Price: product.price.toFixed(2),
      "Inventory tracker": "shopify",
      "Inventory quantity": color.quantities[size] ?? 0,
      "Continue selling when out of stock": "deny",
      "Requires shipping": "TRUE",
      "Variant image URL": original(cover),
    }))
  })

  const rows: Row[] = [...variants]
  images.forEach((image, i) => {
    rows[i] = {
      ...(rows[i] ?? { "URL handle": handle }),
      "Product image URL": image.url,
      "Image position": i + 1,
      "Image alt text": image.alt,
    }
  })
  Object.assign(rows[0], {
    Title: product.name,
    Description: product.description && escapeHtml(product.description),
    Type: product.productType,
    Tags: product.tags.join(", "),
    Status: "draft",
    "Published on online store": "TRUE",
    "Option1 name": "Color",
    "Option2 name": sized ? "Size" : undefined,
    "SEO title": shorten(product.name!, MAX_SEO_TITLE),
    "SEO description": product.description && shorten(product.description, MAX_SEO_DESCRIPTION),
  })
  return rows
}

export function toShopifyCsv(products: Product[]): string {
  const lines = [SHOPIFY_COLUMNS.map(cell).join(",")]
  for (const product of products) {
    for (const row of productRows(product)) {
      lines.push(SHOPIFY_COLUMNS.map((c) => cell(row[c])).join(","))
    }
  }
  // CRLF + BOM: what Excel and Shopify both read without mangling accents.
  return "﻿" + lines.join("\r\n") + "\r\n"
}

function cell(value: string | number | undefined) {
  const s = value === undefined ? "" : String(value)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
