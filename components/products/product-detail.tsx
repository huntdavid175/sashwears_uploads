"use client"

import {
  DownloadIcon,
  EllipsisIcon,
  PencilIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { useState } from "react"

import { Compare } from "@/components/compare"
import { Elapsed } from "@/components/elapsed"
import { Page, PageHeader } from "@/components/page"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { api, exportToShopify, imageUrl, useProduct } from "@/lib/client"
import { formatPrice, stockSizes, totalStock } from "@/lib/dress"
import { SHOPIFY_EXPORT } from "@/lib/features"
import { DEFAULT_SHOTS, shotName } from "@/lib/shoot"
import type { Product, ProductColor, ProductPhoto } from "@/lib/types"

import { EditProductDialog } from "./edit-product-dialog"
import { ProductStatus } from "./product-card"

/** Tiles are at most ~16rem wide; 2x for sharp screens. */
const PREVIEW_WIDTH = 560

export function ProductDetail() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { product, error, refresh, setProduct } = useProduct(id)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  async function regenerate(photo: ProductPhoto) {
    try {
      setProduct(
        await api<Product>(`/api/products/${id}/photos/${photo.id}/regenerate`, { method: "POST" }),
      )
      refresh()
    } catch (err) {
      toast.add({
        type: "error",
        title: "Couldn't regenerate",
        description: (err as Error).message,
      })
    }
  }

  async function exportThis() {
    setBusy("export")
    try {
      await exportToShopify([id])
      refresh()
    } catch (err) {
      toast.add({ type: "error", title: "Couldn't export", description: (err as Error).message })
    } finally {
      setBusy(null)
    }
  }

  async function downloadAll(p: Product) {
    setBusy("download")
    const outputs = p.colors.flatMap((c) =>
      c.photos.flatMap((ph) => (ph.output ? [ph.output] : [])),
    )
    // One at a time, spaced out: browsers drop rapid back-to-back downloads.
    for (const [i, output] of outputs.entries()) {
      if (i) await new Promise((r) => setTimeout(r, 600))
      const a = document.createElement("a")
      a.href = imageUrl(output, { download: true })
      a.rel = "noopener"
      document.body.append(a)
      a.click()
      a.remove()
    }
    setBusy(null)
  }

  async function remove() {
    try {
      await api(`/api/products/${id}`, { method: "DELETE" })
      toast.add({ type: "success", title: "Product deleted" })
      router.push("/products")
    } catch (err) {
      toast.add({ type: "error", title: "Couldn't delete", description: (err as Error).message })
    }
  }

  if (error && !product) {
    return (
      <Page>
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load this product</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </Page>
    )
  }
  if (!product) {
    return (
      <Page>
        <Skeleton className="h-16" />
        <Skeleton className="h-96" />
      </Page>
    )
  }

  const stock = product.colors.reduce((sum, c) => sum + totalStock(c.quantities, product.sizes), 0)
  const hasOutputs = product.colors.some((c) => c.photos.some((p) => p.output))

  return (
    <Page>
      <PageHeader
        title={product.name ?? <span className="text-muted-foreground">Naming…</span>}
        actions={
          <>
            <Button variant="outline" onClick={() => setEditing(true)}>
              <PencilIcon data-icon="inline-start" />
              Edit
            </Button>
            {SHOPIFY_EXPORT && (
              <Button
                onClick={exportThis}
                disabled={product.status !== "ready" || !product.name || busy !== null}
              >
                {busy === "export" ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <UploadIcon data-icon="inline-start" />
                )}
                Export to Shopify
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button size="icon" variant="outline" aria-label="More" />}
              >
                <EllipsisIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    disabled={!hasOutputs || busy !== null}
                    onClick={() => downloadAll(product)}
                  >
                    <DownloadIcon />
                    Download all photos
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={() => setDeleting(true)}>
                    <Trash2Icon />
                    Delete product
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
          <ProductStatus product={product} />
          {product.productType && <Badge variant="outline">{product.productType}</Badge>}
          <span className="text-2xl font-bold text-primary">{formatPrice(product.price)}</span>
          <span className="text-muted-foreground">
            {product.sizes.length ? product.sizes.join(" · ") : "One size"} · {stock} in stock
          </span>
        </div>
        {product.note && <p className="max-w-prose text-sm">{product.note}</p>}
      </PageHeader>

      <div className="grid items-start gap-4 md:grid-cols-2">
        {product.colors.map((color) => (
          <ColorSection
            key={color.id}
            color={color}
            sizes={product.sizes}
            finished={product.kind === "completed"}
            onRegenerate={regenerate}
          />
        ))}
      </div>

      <EditProductDialog
        product={product}
        open={editing}
        onOpenChange={setEditing}
        onSaved={setProduct}
      />

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this product?</AlertDialogTitle>
            <AlertDialogDescription>
              Its photos (originals and results) are removed from ImageKit too. This can&apos;t be
              undone. Products already imported into Shopify aren&apos;t affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>
              Delete product
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  )
}

function ColorSection({
  color,
  sizes,
  finished,
  onRegenerate,
}: {
  color: ProductColor
  sizes: string[]
  /** Uploaded already edited: no original to compare, nothing to regenerate. */
  finished: boolean
  onRegenerate: (photo: ProductPhoto) => void
}) {
  return (
    <Card size="sm">
      <CardHeader className="border-b">
        <CardTitle>{color.name}</CardTitle>
        <CardDescription>
          {totalStock(color.quantities, sizes)} in stock · {color.photos.length} photo
          {color.photos.length === 1 ? "" : "s"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="grid grid-cols-2 gap-2">
          {color.photos.map((photo) => (
            <PhotoTile
              key={photo.id}
              photo={photo}
              finished={finished}
              onRegenerate={onRegenerate}
            />
          ))}
        </ul>
        {/* Stock per size, as a ruled strip. */}
        <dl className="grid grid-cols-[repeat(auto-fill,minmax(4rem,1fr))] overflow-hidden rounded-sm border text-center text-sm">
          {stockSizes(sizes).map((size) => (
            <div key={size} className="border-r border-b last:border-r-0">
              <dt className="bg-muted px-1 py-0.5 text-xs text-muted-foreground">{size}</dt>
              <dd className="py-1 font-bold">{color.quantities[size] ?? 0}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}

function PhotoTile({
  photo,
  finished,
  onRegenerate,
}: {
  photo: ProductPhoto
  finished: boolean
  onRegenerate: (photo: ProductPhoto) => void
}) {
  const shown = photo.output ?? photo.source
  const aspect = shown.width && shown.height ? `${shown.width} / ${shown.height}` : "3 / 4"
  const running = photo.status === "queued" || photo.status === "processing"
  const label = shotName(DEFAULT_SHOTS, photo.view)

  return (
    <li className="flex flex-col overflow-hidden rounded-sm border">
      <div className="relative bg-muted">
        {photo.output && !finished && !running ? (
          <Compare
            before={imageUrl(photo.source, { width: PREVIEW_WIDTH })}
            after={imageUrl(photo.output, { width: PREVIEW_WIDTH })}
            aspect={aspect}
          />
        ) : (
          <div style={{ aspectRatio: aspect }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- ImageKit resizes it */}
            <img
              src={imageUrl(shown, { width: PREVIEW_WIDTH })}
              alt={label}
              className={
                running ? "size-full object-contain opacity-50" : "size-full object-contain"
              }
            />
          </div>
        )}
        {running ? (
          <Badge className="absolute top-1.5 left-1.5">
            <Spinner data-icon="inline-start" />
            {photo.status === "queued" ? "Waiting" : "Working"}
            {photo.status === "processing" && photo.startedAt && (
              <Elapsed since={photo.startedAt} />
            )}
          </Badge>
        ) : photo.status === "failed" ? (
          <Badge variant="alert" className="absolute top-1.5 left-1.5">
            Failed
          </Badge>
        ) : null}
      </div>
      <div className="flex flex-col gap-1 border-t px-2 py-1.5">
        <span className="text-sm font-bold">{label}</span>
        {photo.status === "failed" && photo.error && (
          <p className="text-xs text-destructive" role="alert">
            {photo.error}
          </p>
        )}
        {!running && (
          <div className="-mx-1.5 flex flex-wrap">
            {photo.output && (
              <Button
                size="xs"
                variant="ghost"
                nativeButton={false}
                render={<a href={imageUrl(photo.output, { download: true })} download />}
              >
                <DownloadIcon data-icon="inline-start" />
                Save
              </Button>
            )}
            {!finished && (
              <Button size="xs" variant="ghost" onClick={() => onRegenerate(photo)}>
                {photo.status === "failed" ? (
                  <RotateCcwIcon data-icon="inline-start" />
                ) : (
                  <RefreshCwIcon data-icon="inline-start" />
                )}
                {photo.status === "failed" ? "Retry" : "Redo"}
              </Button>
            )}
          </div>
        )}
      </div>
    </li>
  )
}
