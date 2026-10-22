"use client"

import { ArrowLeftIcon, SparklesIcon, TriangleAlertIcon } from "lucide-react"
import { useId, useState } from "react"

import { PhotoDrop, usePickedPhotos } from "@/components/photos/photo-drop"
import {
  colorLabel,
  dropPhoto,
  groupByColor,
  movePhoto,
  setPhotoView,
  SortedPhotoTile,
  type ColorGroup,
} from "@/components/photos/sorted-photos"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { api, classifyPhotos } from "@/lib/client"
import { MAX_COMPLETED_PHOTOS, parsePrice } from "@/lib/dress"
import { DEFAULT_SHOTS, shotName } from "@/lib/shoot"
import type { PhotoView, Product } from "@/lib/types"

import { ProductBasicsCard, useProductBasics } from "./product-basics"
import { QuantityGrid } from "./fields"

type Group = ColorGroup & { quantities: Record<string, string> }

const noStock = () => ({ quantities: {} })

/**
 * "Completed product": the owner drops every finished photo of one product; the AI sorts them
 * by colour and shot and suggests a name and type; she checks, adds stock, and saves. Nothing
 * is edited.
 */
export function CompletedForm({
  onSubmitted,
  onReviewingChange,
}: {
  onSubmitted: (product: Product) => void
  /** The review step is open: the page hides its type switch (switching would discard it). */
  onReviewingChange?: (reviewing: boolean) => void
}) {
  const id = useId()
  const basics = useProductBasics()
  const photos = usePickedPhotos(MAX_COMPLETED_PHOTOS)
  const { picked } = photos
  const [name, setName] = useState("")
  const [productType, setProductType] = useState("")
  const [groups, setGroups] = useState<Group[] | null>(null)
  const [warning, setWarning] = useState<string | undefined>()
  const [attempted, setAttempted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const busy = progress !== null

  /** Open (or, with null, close) the review step, and tell the page. */
  function showReview(next: Group[] | null) {
    setGroups(next)
    onReviewingChange?.(next !== null)
  }

  /** Step 1 → 2: upload what's new, let the AI sort it, group by colour. */
  async function sortPhotos(e: React.FormEvent) {
    e.preventDefault()
    setAttempted(true)
    try {
      parsePrice(basics.price)
    } catch {
      return setError("Enter the price.")
    }
    if (!picked.length) return setError("Add the product's photos.")
    setError(null)

    try {
      const files = await photos.uploadAll((done, total) =>
        setProgress(`Uploading photos ${done} of ${total}…`),
      )
      setProgress("Sorting by colour…")
      const result = await classifyPhotos(files)
      setName(result.name)
      setProductType(result.productType)
      setWarning(result.warning)
      showReview(groupByColor<Group>(result.photos, DEFAULT_SHOTS, noStock))
      setAttempted(false)
      window.scrollTo({ top: 0, behavior: "smooth" })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setProgress(null)
    }
  }

  /** Problems per group (by key), plus the first overall problem. */
  function problems(list: Group[]) {
    const byGroup = new Map<string, string>()
    const seen = new Set<string>()
    list.forEach((g, i) => {
      const label = colorLabel(g, i)
      const views = g.photos.map((p) => p.view)
      const repeat = views.find((v, j) => views.indexOf(v) !== j)
      const issue = !g.name.trim()
        ? `Name colour ${i + 1}.`
        : seen.has(g.name.trim().toLowerCase())
          ? `"${label}" is listed twice.`
          : repeat
            ? `${label} has two ${shotName(DEFAULT_SHOTS, repeat).toLowerCase()} photos — keep one.`
            : null
      seen.add(g.name.trim().toLowerCase())
      if (issue) byGroup.set(g.key, issue)
    })
    return { byGroup, first: [...byGroup.values()][0] ?? null }
  }

  async function save() {
    if (!groups) return
    setAttempted(true)
    const issue = !name.trim() ? "Give the product a name." : problems(groups).first
    setError(issue)
    if (issue) return
    setProgress("Saving…")
    try {
      const product = await api<Product>("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "completed",
          name,
          productType,
          price: basics.price,
          sizes: basics.sizes,
          note: basics.note,
          colors: groups.map((g) => ({
            name: g.name,
            quantities: g.quantities,
            photos: g.photos.map((p) => ({ fileId: p.fileId, view: p.view })),
          })),
        }),
      })
      toast.add({ type: "success", title: `Saved ${product.name}` })
      onSubmitted(product)
    } catch (err) {
      setError((err as Error).message)
      setProgress(null)
    }
  }

  function updateGroup(key: string, patch: Partial<Group>) {
    setGroups((list) => list && list.map((g) => (g.key === key ? { ...g, ...patch } : g)))
  }

  function setView(fileId: string, view: PhotoView) {
    setGroups((list) => list && setPhotoView(list, fileId, view))
  }

  function move(fileId: string, target: string) {
    setGroups((list) => list && movePhoto(list, fileId, target, noStock))
  }

  function drop(fileId: string) {
    setGroups((list) => list && dropPhoto(list, fileId))
  }

  // ---- Step 2: review -------------------------------------------------------------------------
  if (groups) {
    const { byGroup } = problems(groups)
    const photoCount = groups.reduce((n, g) => n + g.photos.length, 0)

    return (
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Alert>
            {warning ? <TriangleAlertIcon /> : <SparklesIcon />}
            <AlertDescription>
              {warning ??
                `The AI sorted ${photoCount} photos into ${groups.length} colour${groups.length === 1 ? "" : "s"}. Fix anything that's wrong and add the stock.`}
            </AlertDescription>
          </Alert>

          {groups.map((g, i) => (
            <Card key={g.key} size="sm">
              <CardHeader className="border-b">
                <CardTitle>Colour {i + 1}</CardTitle>
                <CardDescription className="flex flex-wrap gap-1">
                  {g.photos.map((p) => (
                    <Badge key={p.fileId} variant="outline">
                      {shotName(DEFAULT_SHOTS, p.view)}
                    </Badge>
                  ))}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FieldGroup>
                  <Field data-invalid={attempted && !g.name.trim() ? true : undefined}>
                    <FieldLabel htmlFor={`${id}-colour-${i}`}>Colour name</FieldLabel>
                    <Input
                      id={`${id}-colour-${i}`}
                      value={g.name}
                      onChange={(e) => updateGroup(g.key, { name: e.target.value })}
                      maxLength={40}
                      disabled={busy}
                      aria-invalid={attempted && !g.name.trim() ? true : undefined}
                      className="max-w-64"
                    />
                  </Field>
                  <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-5">
                    {g.photos.map((p) => (
                      <SortedPhotoTile
                        key={p.fileId}
                        photo={p}
                        groupKey={g.key}
                        groups={groups}
                        shots={DEFAULT_SHOTS}
                        onView={(view) => setView(p.fileId, view)}
                        onMove={(target) => move(p.fileId, target)}
                        onDrop={() => drop(p.fileId)}
                        disabled={busy}
                      />
                    ))}
                  </ul>
                  {byGroup.has(g.key) && <FieldError>{byGroup.get(g.key)}</FieldError>}
                  <Field>
                    <FieldLabel>Stock</FieldLabel>
                    <QuantityGrid
                      sizes={basics.sizes}
                      value={g.quantities}
                      onChange={(quantities) => updateGroup(g.key, { quantities })}
                      disabled={busy}
                      label={colorLabel(g, i)}
                    />
                  </Field>
                </FieldGroup>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card size="sm" className="lg:sticky lg:top-28">
          <CardHeader className="border-b">
            <CardTitle>Product</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field data-invalid={attempted && !name.trim() ? true : undefined}>
                <FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
                <Input
                  id={`${id}-name`}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  disabled={busy}
                  aria-invalid={attempted && !name.trim() ? true : undefined}
                />
                <FieldDescription>The Shopify title and the file names.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor={`${id}-type`}>Type</FieldLabel>
                <Input
                  id={`${id}-type`}
                  value={productType}
                  onChange={(e) => setProductType(e.target.value)}
                  maxLength={40}
                  disabled={busy}
                  placeholder="Dress, Tote Bag…"
                />
              </Field>
              <p className="text-sm text-muted-foreground">
                Saved as finished — no AI editing. Photos are filed in the product&apos;s own
                folder.
              </p>
              <Button type="button" onClick={save} disabled={busy} className="w-full">
                {busy && <Spinner data-icon="inline-start" />}
                {progress ?? "Save product"}
              </Button>
              {error && <FieldError>{error}</FieldError>}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => {
                  showReview(null)
                  setError(null)
                }}
              >
                <ArrowLeftIcon data-icon="inline-start" />
                Back to photos
              </Button>
            </FieldGroup>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ---- Step 1: photos -------------------------------------------------------------------------
  return (
    <form
      onSubmit={sortPhotos}
      className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]"
      noValidate
    >
      <div className="flex min-w-0 flex-col gap-4">
        <ProductBasicsCard basics={basics} busy={busy} attempted={attempted} />
        <Card size="sm">
          <CardHeader className="border-b">
            <CardTitle>Finished photos</CardTitle>
            <CardDescription>
              Every photo of this product: each colour from the front, and the back, side, inside or
              a detail if you have them.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PhotoDrop
              id={`${id}-files`}
              picked={picked}
              onAdd={photos.add}
              onRemove={photos.remove}
              disabled={busy}
              invalid={attempted && !picked.length}
            />
          </CardContent>
        </Card>
      </div>

      <Card size="sm" className="xl:sticky xl:top-28">
        <CardHeader className="border-b">
          <CardTitle>Next: sort by colour</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            <span className="text-2xl font-bold text-foreground">{picked.length}</span> photo
            {picked.length === 1 ? "" : "s"} selected
          </p>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <SparklesIcon data-icon="inline-start" />
            )}
            {progress ?? "Sort by colour"}
          </Button>
          {error && <FieldError>{error}</FieldError>}
        </CardContent>
      </Card>
    </form>
  )
}
