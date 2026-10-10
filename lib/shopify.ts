import type { Product, StoredImage } from "@/lib/types"

/**
 * Shopify product CSV (the "URL handle" / "Inventory quantity" format), checked against
 * Shopify's product_template.csv on 2026-10-10. Only the columns we fill are included;
 * Shopify accepts a subset as long as "Title" is present.
 *
 * Layout per dress: one row per Color × Size variant (Option1 = Color, Option2 = Size), the
 * first row also carries the product fields and option names. Product images go on rows by
 * position (extra rows hold only the handle and image when there are more images than variants).
 * Each colour's front photo is that colour's variant image. Products import as drafts.
 */
export const SHOPIFY_COLUMNS = [
  "Title",
  "URL handle",
  "Status",
  "Published on online store",
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
] as const

type Column = (typeof SHOPIFY_COLUMNS)[number]
type Row = Partial<Record<Column, string | number>>

/** Original file from ImageKit (Shopify re-hosts it on import). */
function original(image: StoredImage) {
  const url = new URL(image.url)
  url.search = ""
  url.searchParams.set("tr", "orig-true")
  return url.toString()
}

/** Throws if a dress isn't ready to export (unnamed or missing results). */
export function assertExportable(product: Product) {
  const label = product.name ?? "A dress"
  if (!product.name || !product.handle) throw new Error(`${label} hasn't been named yet`)
  if (product.status !== "ready")
    throw new Error(`${label} is still generating or has failed photos`)
  for (const color of product.colors) {
    if (!color.photos.find((p) => p.view === "front")?.output) {
      throw new Error(`${label}: ${color.name} has no finished front photo`)
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
        alt: `${product.name} – ${color.name}, ${p.view}`,
      })),
  )

  const variants: Row[] = product.colors.flatMap((color) => {
    const front = color.photos.find((p) => p.view === "front")!.output!
    return product.sizes.map((size) => ({
      "URL handle": handle,
      "Option1 value": color.name,
      "Option2 value": size,
      Price: product.price.toFixed(2),
      "Inventory tracker": "shopify",
      "Inventory quantity": color.quantities[size] ?? 0,
      "Continue selling when out of stock": "deny",
      "Requires shipping": "TRUE",
      "Variant image URL": original(front),
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
    Status: "draft",
    "Published on online store": "TRUE",
    "Option1 name": "Color",
    "Option2 name": "Size",
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
