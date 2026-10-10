"use client"

import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { imageUrl } from "@/lib/client"
import { formatPrice, totalStock } from "@/lib/dress"
import type { Product } from "@/lib/types"

export function DressStatus({ product }: { product: Product }) {
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
  if (product.status === "attention") return <Badge variant="destructive">Needs attention</Badge>
  if (product.exportedAt) return <Badge variant="outline">Exported</Badge>
  return <Badge variant="secondary">Ready</Badge>
}

/** First colour's front: the result when there is one, else the original. */
export function coverImage(product: Product) {
  const front = product.colors[0]?.photos.find((p) => p.view === "front")
  return front?.output ?? front?.source
}

export function DressCard({ product }: { product: Product }) {
  const cover = coverImage(product)
  const stock = product.colors.reduce((sum, c) => sum + totalStock(c.quantities, product.sizes), 0)

  return (
    <Link
      href={`/dresses/${product.id}`}
      className="group flex flex-col overflow-hidden rounded-xl bg-card text-card-foreground ring-1 ring-border outline-none hover:ring-primary focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <div className="aspect-[3/4] bg-muted">
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element -- ImageKit resizes it
          <img
            src={imageUrl(cover, { width: 480 })}
            alt=""
            loading="lazy"
            className="size-full object-cover"
          />
        )}
      </div>
      <div className="flex flex-col gap-1.5 p-3">
        <p className="font-condensed truncate text-base font-semibold">
          {product.name ?? <span className="text-muted-foreground">Naming…</span>}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {formatPrice(product.price)} · {product.colors.length} colour
          {product.colors.length === 1 ? "" : "s"} · {stock} in stock
        </p>
        <div>
          <DressStatus product={product} />
        </div>
      </div>
    </Link>
  )
}
