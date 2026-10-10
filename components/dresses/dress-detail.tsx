"use client"

import {
  ArrowLeftIcon,
  DownloadIcon,
  EllipsisIcon,
  PencilIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import { Compare } from "@/components/compare"
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
import { formatPrice, totalStock } from "@/lib/dress"
import type { Product, ProductColor, ProductPhoto } from "@/lib/types"

import { DressStatus } from "./dress-card"
import { EditDressDialog } from "./edit-dress-dialog"

/** Previews are at most ~22rem wide; 2x for sharp screens. */
const PREVIEW_WIDTH = 720

export function DressDetail() {
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
      toast.add({ type: "success", title: "Dress deleted" })
      router.push("/dresses")
    } catch (err) {
      toast.add({ type: "error", title: "Couldn't delete", description: (err as Error).message })
    }
  }

  if (error && !product) {
    return (
      <main className="mx-auto w-full max-w-6xl p-4 md:p-8">
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load this dress</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </main>
    )
  }
  if (!product) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-8">
        <Skeleton className="h-24" />
        <Skeleton className="h-96" />
      </main>
    )
  }

  const stock = product.colors.reduce((sum, c) => sum + totalStock(c.quantities, product.sizes), 0)
  const hasOutputs = product.colors.some((c) => c.photos.some((p) => p.output))

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-8">
      <Button
        size="sm"
        variant="ghost"
        className="self-start"
        nativeButton={false}
        render={<Link href="/dresses" />}
      >
        <ArrowLeftIcon data-icon="inline-start" />
        Dresses
      </Button>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="font-condensed text-4xl leading-none font-bold tracking-tight md:text-5xl">
            {product.name ?? <span className="text-muted-foreground">Naming…</span>}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <DressStatus product={product} />
            <span className="font-medium text-foreground">{formatPrice(product.price)}</span>
            <span>·</span>
            <span>{product.sizes.join(", ")}</span>
            <span>·</span>
            <span>{stock} in stock</span>
          </div>
          {product.note && <p className="max-w-prose text-sm">{product.note}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setEditing(true)}>
            <PencilIcon data-icon="inline-start" />
            Edit
          </Button>
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
                  Delete dress
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {product.colors.map((color) => (
        <ColorSection
          key={color.id}
          color={color}
          sizes={product.sizes}
          finished={product.kind === "completed"}
          onRegenerate={regenerate}
        />
      ))}

      <EditDressDialog
        product={product}
        open={editing}
        onOpenChange={setEditing}
        onSaved={setProduct}
      />

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this dress?</AlertDialogTitle>
            <AlertDialogDescription>
              Its photos (originals and results) are removed from ImageKit too. This can&apos;t be
              undone. Products already imported into Shopify aren&apos;t affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>
              Delete dress
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
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
    <Card>
      <CardHeader>
        <CardTitle>{color.name}</CardTitle>
        <CardDescription>
          {sizes.map((s) => `${s} ${color.quantities[s] ?? 0}`).join(" · ")} ·{" "}
          {totalStock(color.quantities, sizes)} in stock
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2 lg:max-w-3xl">
          {color.photos.map((photo) => (
            <PhotoTile
              key={photo.id}
              photo={photo}
              finished={finished}
              onRegenerate={onRegenerate}
            />
          ))}
        </div>
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

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium capitalize">{photo.view}</span>
        {running ? (
          <Badge>
            <Spinner data-icon="inline-start" />
            {photo.status === "queued" ? "Waiting" : "Working"}
            {photo.status === "processing" && photo.startedAt && (
              <Elapsed since={photo.startedAt} />
            )}
          </Badge>
        ) : photo.status === "failed" ? (
          <Badge variant="destructive">Failed</Badge>
        ) : null}
      </figcaption>

      {photo.output && finished ? (
        <div className="overflow-hidden rounded-md bg-muted" style={{ aspectRatio: aspect }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- ImageKit resizes it */}
          <img
            src={imageUrl(photo.output, { width: PREVIEW_WIDTH })}
            alt={photo.view}
            className="size-full object-contain"
          />
        </div>
      ) : photo.output && !running ? (
        <Compare
          before={imageUrl(photo.source, { width: PREVIEW_WIDTH })}
          after={imageUrl(photo.output, { width: PREVIEW_WIDTH })}
          aspect={aspect}
        />
      ) : (
        <div className="overflow-hidden rounded-md bg-muted" style={{ aspectRatio: aspect }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- ImageKit resizes it */}
          <img
            src={imageUrl(photo.source, { width: PREVIEW_WIDTH })}
            alt={`Original ${photo.view}`}
            className="size-full object-contain opacity-60"
          />
        </div>
      )}

      {photo.status === "failed" && photo.error && (
        <p className="text-sm text-destructive" role="alert">
          {photo.error}
        </p>
      )}

      {!running && (
        <div className="flex flex-wrap gap-2">
          {photo.output && (
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<a href={imageUrl(photo.output, { download: true })} download />}
            >
              <DownloadIcon data-icon="inline-start" />
              Download
            </Button>
          )}
          {!finished && (
            <Button size="sm" variant="ghost" onClick={() => onRegenerate(photo)}>
              {photo.status === "failed" ? (
                <RotateCcwIcon data-icon="inline-start" />
              ) : (
                <RefreshCwIcon data-icon="inline-start" />
              )}
              {photo.status === "failed" ? "Retry" : "Regenerate"}
            </Button>
          )}
        </div>
      )}
    </figure>
  )
}

function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const s = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000))
  return (
    <span className="tabular-nums">{`${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`}</span>
  )
}
