/** The owner's fixes to the AI's sorting of a mixed upload, before anything is generated. */

import type { SortedPhoto } from "@/lib/client"

type Color = { key: string; name: string; photos: SortedPhoto[] }

/** A product the AI found; the owner can rename it, merge it or move its photos. */
export type ProductGroup = {
  key: string
  name: string
  description: string
  productType?: string
  tags?: string[]
  groups: Color[]
}

/** Move target: a product of its own. Any other target is a colour's key or `newColorIn(..)`. */
export const NEW_PRODUCT = "__new-product"
const NEW_COLOR = "__new-colour:"

/** Move target: a new colour of this product. */
export const newColorIn = (productKey: string) => `${NEW_COLOR}${productKey}`

/** "Product 2" for an unnamed product. */
export function productLabel(product: ProductGroup, index: number) {
  return product.name.trim() || `Product ${index + 1}`
}

/** Empty colours and empty products disappear. */
function prune(products: ProductGroup[]) {
  return products
    .map((p) => ({ ...p, groups: p.groups.filter((g) => g.photos.length) }))
    .filter((p) => p.groups.length)
}

/** Move a photo to another colour of any product, a new colour, or a new product. */
export function movePhotoTo(
  products: ProductGroup[],
  fileId: string,
  target: string,
  newKey: () => string,
) {
  const from = products
    .flatMap((p) => p.groups)
    .find((g) => g.photos.some((x) => x.fileId === fileId))
  const photo = from?.photos.find((x) => x.fileId === fileId)
  if (!from || !photo) return products
  const next = products.map((p) => ({
    ...p,
    groups: p.groups.map((g) => ({ ...g, photos: g.photos.filter((x) => x !== photo) })),
  }))
  if (target === NEW_PRODUCT) {
    const groups = [{ key: newKey(), name: from.name, photos: [photo] }]
    return prune([...next, { key: newKey(), name: "", description: "", groups }])
  }
  if (target.startsWith(NEW_COLOR)) {
    const key = target.slice(NEW_COLOR.length)
    return prune(
      next.map((p) =>
        p.key === key
          ? { ...p, groups: [...p.groups, { key: newKey(), name: "", photos: [photo] }] }
          : p,
      ),
    )
  }
  return prune(
    next.map((p) => ({
      ...p,
      groups: p.groups.map((g) => (g.key === target ? { ...g, photos: [...g.photos, photo] } : g)),
    })),
  )
}

export function leaveOutPhoto(products: ProductGroup[], fileId: string) {
  return prune(
    products.map((p) => ({
      ...p,
      groups: p.groups.map((g) => ({
        ...g,
        photos: g.photos.filter((x) => x.fileId !== fileId),
      })),
    })),
  )
}

/**
 * The AI split one product in two: pour `from` into `into`. A colour both have (any case)
 * becomes one; an unnamed or undescribed `into` takes `from`'s words.
 */
export function mergeProducts(products: ProductGroup[], from: string, into: string) {
  const source = products.find((p) => p.key === from)
  if (!source || from === into) return products
  return products
    .filter((p) => p.key !== from)
    .map((p) => {
      if (p.key !== into) return p
      const groups = [...p.groups]
      for (const color of source.groups) {
        const name = color.name.trim().toLowerCase()
        const same = groups.findIndex((g) => g.name.trim().toLowerCase() === name)
        if (same < 0) groups.push(color)
        else groups[same] = { ...groups[same], photos: [...groups[same].photos, ...color.photos] }
      }
      return {
        ...p,
        name: p.name.trim() ? p.name : source.name,
        description: p.description.trim() ? p.description : source.description,
        productType: p.productType || source.productType,
        tags: p.tags?.length ? p.tags : source.tags,
        groups,
      }
    })
}
