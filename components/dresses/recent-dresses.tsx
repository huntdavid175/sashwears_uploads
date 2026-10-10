"use client"

import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useProducts } from "@/lib/client"

import { DressCard } from "./dress-card"

const SHOWN = 4

/** The last few submitted dresses, so the store owner sees theirs arrive and generate. */
export function RecentDresses({ highlight }: { highlight?: string }) {
  const { products } = useProducts()
  if (products && products.length === 0) return null

  return (
    <section aria-labelledby="recent" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="recent" className="text-lg font-semibold tracking-tight">
          Recently submitted
        </h2>
        <Button size="sm" variant="ghost" nativeButton={false} render={<Link href="/dresses" />}>
          See all
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {products === null
          ? Array.from({ length: SHOWN }, (_, i) => <Skeleton key={i} className="aspect-[3/5]" />)
          : products
              .slice(0, SHOWN)
              .map((p) => <DressCard key={p.id} product={p} highlight={p.id === highlight} />)}
      </div>
    </section>
  )
}
