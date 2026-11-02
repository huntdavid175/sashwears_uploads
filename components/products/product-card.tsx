"use client"

import { Trash2Icon } from "lucide-react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { imageUrl } from "@/lib/client"
import { formatPrice, totalStock } from "@/lib/dress"
import type { Product } from "@/lib/types"

/** Generating (red, with progress), needs attention (red outline), exported, or ready. */
export function ProductStatus({ product }: { product: Product }) {
  if (product.status === "generating") {
    const photos = product.colors.flatMap((c) => c.photos)
    const done = photos.filter((p) => p.status === "done").length
    return (
      <Badge>
        <Spinner data-icon="inline-start" />
        Generating {done}/{photos.length}
      </Badge>
    )
  }
  if (product.status === "attention") return <Badge variant="alert">Needs attention</Badge>
  if (product.exportedAt) return <Badge variant="outline">Exported</Badge>
  return <Badge variant="ink">Ready</Badge>
}

/** First colour's first photo: the result when there is one, else the original. */
export function coverImage(product: Product) {
  const first = product.colors[0]?.photos[0]
  return first?.output ?? first?.source
}

export function ProductCard({ product, onDelete }: { product: Product; onDelete: () => void }) {
  const cover = coverImage(product)
  const stock = product.colors.reduce((sum, c) => sum + totalStock(c.quantities, product.sizes), 0)

  return (
    // The delete button sits beside the link, not in it: a button can't go inside an <a>.
    <div className="relative">
      <Link
        href={`/products/${product.id}`}
        className="group flex h-full flex-col overflow-hidden rounded-sm border bg-card text-card-foreground outline-none hover:border-primary focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <div className="relative aspect-[3/4] bg-muted">
          {cover && (
            // eslint-disable-next-line @next/next/no-img-element -- ImageKit resizes it
            <img
              src={imageUrl(cover, { width: 480 })}
              alt=""
              loading="lazy"
              className="size-full object-cover"
            />
          )}
          <div className="absolute top-1.5 left-1.5">
            <ProductStatus product={product} />
          </div>
        </div>
        <div className="flex flex-col gap-0.5 border-t p-2.5">
          {product.productType && (
            <span className="text-xs text-muted-foreground">{product.productType}</span>
          )}
          <p className="line-clamp-2 text-sm leading-snug font-bold group-hover:text-primary">
            {product.name ?? <span className="text-muted-foreground">Naming…</span>}
          </p>
          <p className="text-xs text-muted-foreground">
            {product.colors.length} colour{product.colors.length === 1 ? "" : "s"} · {stock} in
            stock
          </p>
          <p className="text-lg font-bold text-primary">{formatPrice(product.price)}</p>
        </div>
      </Link>
      <Button
        variant="secondary"
        size="icon-sm"
        aria-label={`Delete ${product.name ?? "this product"}`}
        title="Delete"
        className="absolute top-1.5 right-1.5"
        onClick={onDelete}
      >
        <Trash2Icon />
      </Button>
    </div>
  )
}
