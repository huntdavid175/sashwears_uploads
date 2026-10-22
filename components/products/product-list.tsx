"use client"

import { DownloadIcon, PlusIcon } from "lucide-react"
import Link from "next/link"
import { useId, useState } from "react"

import { Page, PageHeader } from "@/components/page"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { toast } from "@/components/ui/toast"
import { exportToShopify, useProducts } from "@/lib/client"
import { SHOPIFY_EXPORT } from "@/lib/features"
import type { Product } from "@/lib/types"

import { ProductCard } from "./product-card"

const ALL = "__all"
const UNTYPED = "__untyped"

export function ProductList() {
  const id = useId()
  const { products, error, refresh } = useProducts()
  const [exporting, setExporting] = useState(false)
  const [type, setType] = useState(ALL)
  const [query, setQuery] = useState("")

  // Filter rail: every product type with its count, most common first.
  const types = new Map<string, number>()
  for (const p of products ?? []) {
    const t = p.productType || UNTYPED
    types.set(t, (types.get(t) ?? 0) + 1)
  }
  const typeItems = [...types.entries()].sort((a, b) => b[1] - a[1])
  const q = query.trim().toLowerCase()
  const shown = (products ?? []).filter(
    (p) =>
      (type === ALL || (p.productType || UNTYPED) === type) &&
      (!q || `${p.name ?? ""} ${p.productType ?? ""}`.toLowerCase().includes(q)),
  )

  return (
    <Page>
      <PageHeader
        title="Products"
        description="Everything saved for the shop. Open one to see all its photos."
        actions={
          <>
            {SHOPIFY_EXPORT && (
              <Button
                variant="outline"
                onClick={() => setExporting(true)}
                disabled={!products?.length}
              >
                <DownloadIcon data-icon="inline-start" />
                Export to Shopify
              </Button>
            )}
            <Button nativeButton={false} render={<Link href="/" />}>
              <PlusIcon data-icon="inline-start" />
              Upload
            </Button>
          </>
        }
      />

      {error && !products ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load products</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : products === null ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton key={i} className="aspect-[3/5]" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <Empty className="border border-dashed bg-card">
          <EmptyHeader>
            <EmptyTitle>No products yet</EmptyTitle>
            <EmptyDescription>
              Products you save from finished photos show up here, with their colours and stock.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button nativeButton={false} render={<Link href="/" />}>
              <PlusIcon data-icon="inline-start" />
              Upload a product
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[13rem_minmax(0,1fr)]">
          <Card size="sm" className="gap-0 py-0 lg:sticky lg:top-28">
            <CardHeader className="bg-primary py-2 text-primary-foreground">
              <CardTitle>Product type</CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              <ToggleGroup
                spacing={1}
                value={[type]}
                onValueChange={(v) => setType(v[0] ?? ALL)}
                aria-label="Product type"
                className="flex w-full flex-wrap lg:flex-col lg:items-stretch"
              >
                {[[ALL, products.length] as const, ...typeItems].map(([value, n]) => (
                  <ToggleGroupItem
                    key={value}
                    value={value}
                    size="sm"
                    className="justify-between gap-3 px-2.5"
                  >
                    <span className="truncate">
                      {value === ALL ? "All products" : value === UNTYPED ? "No type" : value}
                    </span>
                    <span className="text-xs opacity-80">{n}</span>
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </CardContent>
          </Card>

          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Input
                id={`${id}-search`}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or type"
                aria-label="Search products"
                className="max-w-72 bg-card"
              />
              <span className="text-sm text-muted-foreground">
                <span className="font-bold text-foreground">{shown.length}</span> of{" "}
                {products.length}
              </span>
            </div>
            {shown.length ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {shown.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            ) : (
              <Empty className="border border-dashed bg-card">
                <EmptyHeader>
                  <EmptyTitle>Nothing matches</EmptyTitle>
                  <EmptyDescription>Try another name, or show all products.</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setType(ALL)
                      setQuery("")
                    }}
                  >
                    Show all
                  </Button>
                </EmptyContent>
              </Empty>
            )}
          </div>
        </div>
      )}

      <ExportDialog
        open={exporting}
        onOpenChange={setExporting}
        products={products ?? []}
        onExported={refresh}
      />
    </Page>
  )
}

function ExportDialog({
  open,
  onOpenChange,
  products,
  onExported,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  products: Product[]
  onExported: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open && (
          <ExportForm
            products={products}
            onDone={() => {
              onExported()
              onOpenChange(false)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function ExportForm({ products, onDone }: { products: Product[]; onDone: () => void }) {
  const ready = products.filter((p) => p.status === "ready" && p.name)
  const fresh = ready.filter((p) => !p.exportedAt)
  const [which, setWhich] = useState<"new" | "all">(fresh.length ? "new" : "all")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const chosen = which === "new" ? fresh : ready
  const waiting = products.length - ready.length

  async function run() {
    setBusy(true)
    setError(null)
    try {
      await exportToShopify(chosen.map((p) => p.id))
      toast.add({
        type: "success",
        title: `Exported ${chosen.length} product${chosen.length === 1 ? "" : "s"}`,
        description: "In Shopify: Products → Import, then choose this file.",
      })
      onDone()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>Export to Shopify</DialogTitle>
        <DialogDescription>
          Downloads a product CSV: one variant per colour and size with price and stock, and all
          photos. Products import as drafts so you can check them before publishing.
        </DialogDescription>
      </DialogHeader>

      <ToggleGroup
        variant="outline"
        spacing={0}
        value={[which]}
        onValueChange={(v) => v[0] && setWhich(v[0] as "new" | "all")}
      >
        <ToggleGroupItem value="new">Not exported yet ({fresh.length})</ToggleGroupItem>
        <ToggleGroupItem value="all">All ready ({ready.length})</ToggleGroupItem>
      </ToggleGroup>

      {chosen.length > 0 ? (
        <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto text-sm">
          {chosen.map((p) => (
            <li key={p.id} className="truncate">
              {p.name}
              <span className="text-muted-foreground">
                {" "}
                · {p.colors.length} colour{p.colors.length === 1 ? "" : "s"}
                {p.sizes.length
                  ? ` × ${p.sizes.length} size${p.sizes.length === 1 ? "" : "s"}`
                  : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nothing to export here.</p>
      )}
      {waiting > 0 && (
        <p className="text-sm text-muted-foreground">
          {waiting} product{waiting === 1 ? " isn't" : "s aren't"} ready yet (still generating or a
          photo failed) and {waiting === 1 ? "is" : "are"} left out.
        </p>
      )}
      {error && <FieldError>{error}</FieldError>}

      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button onClick={run} disabled={busy || chosen.length === 0}>
          {busy ? <Spinner data-icon="inline-start" /> : <DownloadIcon data-icon="inline-start" />}
          Download CSV
        </Button>
      </DialogFooter>
    </div>
  )
}
