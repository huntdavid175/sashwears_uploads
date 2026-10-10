"use client"

import { ArrowLeftIcon, ImagePlusIcon, SparklesIcon, XIcon } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { toast } from "@/components/ui/toast"
import { api, imageUrl, uploadToImageKit } from "@/lib/client"
import { MAX_COMPLETED_PHOTOS, parsePrice } from "@/lib/dress"
import type { PhotoView, Product, StoredImage } from "@/lib/types"
import { cn } from "@/lib/utils"

import { DressBasicsCard, useDressBasics } from "./dress-basics"
import { PHOTO_ACCEPT, QuantityGrid } from "./fields"

type Picked = { key: string; file: File; url: string }
type SortedPhoto = { fileId: string; originalName: string; image: StoredImage; view: PhotoView }
type Group = {
  key: string
  name: string
  quantities: Record<string, string>
  photos: SortedPhoto[]
}
type Classified = {
  name: string
  warning?: string
  photos: (SortedPhoto & { color: string })[]
}

/** Photos uploaded to ImageKit at once. */
const PARALLEL = 3
const NEW_GROUP = "__new"

// React list keys only (not used in ids), so a counter is enough and stays prerender-safe.
let keys = 0
const nextKey = () => `k${++keys}`

/**
 * "Completed dress": the owner drops every finished photo of one dress; the AI sorts them by
 * colour and front/back; she checks the result, adds stock, and saves. Nothing is edited.
 */
export function CompletedDressForm({ onSubmitted }: { onSubmitted: (product: Product) => void }) {
  const id = useId()
  const basics = useDressBasics()
  const [picked, setPicked] = useState<Picked[]>([])
  const [dragging, setDragging] = useState(false)
  const [name, setName] = useState("")
  const [groups, setGroups] = useState<Group[] | null>(null)
  const [warning, setWarning] = useState<string | undefined>()
  const [attempted, setAttempted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const busy = progress !== null
  // Files already on ImageKit, so going back and sorting again doesn't upload twice.
  const uploaded = useRef(new Map<string, string>())

  // Free preview URLs on unmount (removal frees its own).
  const latest = useRef(picked)
  useEffect(() => {
    latest.current = picked
  }, [picked])
  useEffect(() => () => latest.current.forEach((p) => URL.revokeObjectURL(p.url)), [])

  function add(files: FileList | File[]) {
    const accepted = PHOTO_ACCEPT.split(",")
    const list = Array.from(files)
    const images = list.filter((f) => accepted.includes(f.type))
    if (images.length < list.length) {
      toast.add({
        type: "warning",
        title: `Skipped ${list.length - images.length} file(s)`,
        description: "Only PNG, JPEG and WebP photos work.",
      })
    }
    const room = MAX_COMPLETED_PHOTOS - picked.length
    if (images.length > room) {
      toast.add({ type: "warning", title: `Up to ${MAX_COMPLETED_PHOTOS} photos per dress` })
    }
    const next = images
      .slice(0, room)
      .map((file) => ({ key: nextKey(), file, url: URL.createObjectURL(file) }))
    setPicked((p) => [...p, ...next])
  }

  function removePicked(key: string) {
    setPicked((list) => {
      const gone = list.find((p) => p.key === key)
      if (gone) URL.revokeObjectURL(gone.url)
      return list.filter((p) => p.key !== key)
    })
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
    if (!basics.sizes.length) return setError("Pick at least one size.")
    if (!picked.length) return setError("Add the dress's photos.")
    setError(null)

    try {
      const todo = picked.filter((p) => !uploaded.current.has(p.key))
      let done = picked.length - todo.length
      setProgress(`Uploading photos ${done} of ${picked.length}…`)
      const queue = [...todo]
      await Promise.all(
        Array.from({ length: PARALLEL }, async () => {
          for (let p = queue.shift(); p; p = queue.shift()) {
            uploaded.current.set(p.key, await uploadToImageKit(p.file, "sources"))
            setProgress(`Uploading photos ${++done} of ${picked.length}…`)
          }
        }),
      )
      setProgress("Sorting by colour…")
      const result = await api<Classified>("/api/products/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: picked.map((p) => ({
            fileId: uploaded.current.get(p.key),
            originalName: p.file.name,
          })),
        }),
      })
      setName(result.name)
      setWarning(result.warning)
      setGroups(groupByColor(result.photos))
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
      const label = g.name.trim() || `Colour ${i + 1}`
      const fronts = g.photos.filter((p) => p.view === "front").length
      const backs = g.photos.filter((p) => p.view === "back").length
      const issue = !g.name.trim()
        ? `Name colour ${i + 1}.`
        : seen.has(g.name.trim().toLowerCase())
          ? `"${label}" is listed twice.`
          : fronts !== 1
            ? `${label} needs exactly one front photo (has ${fronts}).`
            : backs > 1
              ? `${label} has ${backs} back photos — keep one.`
              : null
      seen.add(g.name.trim().toLowerCase())
      if (issue) byGroup.set(g.key, issue)
    })
    return { byGroup, first: [...byGroup.values()][0] ?? null }
  }

  async function save() {
    if (!groups) return
    setAttempted(true)
    const issue = !name.trim() ? "Give the dress a name." : problems(groups).first
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
    setGroups(
      (list) =>
        list &&
        list.map((g) => ({
          ...g,
          photos: g.photos.map((p) => (p.fileId === fileId ? { ...p, view } : p)),
        })),
    )
  }

  /** Move a photo to another colour (or a new one); empty colours disappear. */
  function movePhoto(fileId: string, target: string) {
    setGroups((list) => {
      if (!list) return list
      const photo = list.flatMap((g) => g.photos).find((p) => p.fileId === fileId)!
      let next = list.map((g) => ({ ...g, photos: g.photos.filter((p) => p.fileId !== fileId) }))
      if (target === NEW_GROUP) {
        next.push({
          key: nextKey(),
          name: "",
          quantities: {},
          photos: [{ ...photo, view: "front" }],
        })
      } else {
        next = next.map((g) => (g.key === target ? { ...g, photos: [...g.photos, photo] } : g))
      }
      return next.filter((g) => g.photos.length)
    })
  }

  function dropPhoto(fileId: string) {
    setGroups(
      (list) =>
        list &&
        list
          .map((g) => ({ ...g, photos: g.photos.filter((p) => p.fileId !== fileId) }))
          .filter((g) => g.photos.length),
    )
  }

  // ---- Step 2: review -------------------------------------------------------------------------
  if (groups) {
    const { byGroup } = problems(groups)
    const groupItems = [
      ...groups.map((g, i) => ({ value: g.key, label: g.name.trim() || `Colour ${i + 1}` })),
      { value: NEW_GROUP, label: "New colour" },
    ]
    const photoCount = groups.reduce((n, g) => n + g.photos.length, 0)

    return (
      <div className="flex flex-col gap-6">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          disabled={busy}
          onClick={() => {
            setGroups(null)
            setError(null)
          }}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          Back to photos
        </Button>

        {warning ? (
          <Alert>
            <AlertDescription>{warning}</AlertDescription>
          </Alert>
        ) : (
          <Alert>
            <SparklesIcon />
            <AlertDescription>
              The AI sorted {photoCount} photos into {groups.length} colour
              {groups.length === 1 ? "" : "s"}. Check them, fix anything that&apos;s wrong, and add
              the stock.
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardContent>
            <Field data-invalid={attempted && !name.trim() ? true : undefined}>
              <FieldLabel htmlFor={`${id}-name`}>Dress name</FieldLabel>
              <Input
                id={`${id}-name`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                disabled={busy}
                aria-invalid={attempted && !name.trim() ? true : undefined}
              />
              <FieldDescription>Used for the Shopify title and the file names.</FieldDescription>
            </Field>
          </CardContent>
        </Card>

        {groups.map((g, i) => (
          <Card key={g.key}>
            <CardHeader>
              <CardTitle>Colour {i + 1}</CardTitle>
              <CardDescription>
                {g.photos.length} photo{g.photos.length === 1 ? "" : "s"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor={`${id}-colour-${i}`}>Colour name</FieldLabel>
                  <Input
                    id={`${id}-colour-${i}`}
                    value={g.name}
                    onChange={(e) => updateGroup(g.key, { name: e.target.value })}
                    maxLength={40}
                    disabled={busy}
                    className="max-w-64"
                  />
                </Field>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {g.photos.map((p) => (
                    <li key={p.fileId} className="flex flex-col gap-2">
                      <div className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element -- ImageKit resizes it */}
                        <img
                          src={imageUrl(p.image, { width: 400 })}
                          alt={p.originalName || "Dress photo"}
                          className="aspect-[3/4] w-full rounded-md bg-muted object-cover"
                        />
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="secondary"
                          aria-label="Leave this photo out"
                          disabled={busy}
                          onClick={() => dropPhoto(p.fileId)}
                          className="absolute top-1.5 right-1.5"
                        >
                          <XIcon />
                        </Button>
                      </div>
                      <ToggleGroup
                        variant="outline"
                        size="sm"
                        spacing={0}
                        value={[p.view]}
                        onValueChange={(v) => v[0] && setView(p.fileId, v[0] as PhotoView)}
                        disabled={busy}
                      >
                        <ToggleGroupItem value="front">Front</ToggleGroupItem>
                        <ToggleGroupItem value="back">Back</ToggleGroupItem>
                      </ToggleGroup>
                      {groups.length > 0 && (
                        <Select
                          items={groupItems}
                          value={g.key}
                          onValueChange={(v) => v && v !== g.key && movePhoto(p.fileId, v)}
                          disabled={busy}
                        >
                          <SelectTrigger size="sm" className="w-full" aria-label="Colour">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {groupItems.map((item) => (
                                <SelectItem key={item.value} value={item.value}>
                                  {item.label}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      )}
                    </li>
                  ))}
                </ul>
                {byGroup.has(g.key) && (attempted || g.photos.length > 1) && (
                  <FieldError>{byGroup.get(g.key)}</FieldError>
                )}
                <Field>
                  <FieldLabel>Quantity per size</FieldLabel>
                  <QuantityGrid
                    sizes={basics.sizes}
                    value={g.quantities}
                    onChange={(quantities) => updateGroup(g.key, { quantities })}
                    disabled={busy}
                    label={g.name.trim() || `Colour ${i + 1}`}
                  />
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>
        ))}

        <Card size="sm">
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Saved as finished — no AI editing. Photos are filed in the dress&apos;s own folder.
            </p>
            <Button type="button" onClick={save} disabled={busy}>
              {busy && <Spinner data-icon="inline-start" />}
              {progress ?? "Save dress"}
            </Button>
            {error && <FieldError className="w-full">{error}</FieldError>}
          </CardContent>
        </Card>
      </div>
    )
  }

  // ---- Step 1: photos -------------------------------------------------------------------------
  return (
    <form onSubmit={sortPhotos} className="flex flex-col gap-6" noValidate>
      <DressBasicsCard basics={basics} busy={busy} attempted={attempted} />

      <Card>
        <CardHeader>
          <CardTitle>Photos</CardTitle>
          <CardDescription>
            Every finished photo of this dress: the front of each colour, and backs if you have
            them. The AI sorts them by colour next.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <label
            htmlFor={`${id}-files`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              if (!busy) add(e.dataTransfer.files)
            }}
            aria-invalid={attempted && !picked.length ? true : undefined}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/50 px-4 py-10 text-center text-sm text-muted-foreground hover:border-primary has-focus-visible:ring-3 has-focus-visible:ring-ring/50 aria-invalid:border-destructive",
              dragging && "border-primary bg-muted",
            )}
          >
            <ImagePlusIcon className="size-6" />
            <span>
              <span className="font-medium text-foreground">Choose photos</span> or drop them here
            </span>
            <input
              id={`${id}-files`}
              type="file"
              accept={PHOTO_ACCEPT}
              multiple
              disabled={busy}
              className="sr-only"
              onChange={(e) => {
                if (e.target.files) add(e.target.files)
                e.target.value = ""
              }}
            />
          </label>
          {picked.length > 0 && (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2">
              {picked.map((p) => (
                <li key={p.key} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
                  <img
                    src={p.url}
                    alt={p.file.name}
                    className="aspect-[3/4] w-full rounded-md bg-muted object-cover"
                  />
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="secondary"
                    aria-label={`Remove ${p.file.name}`}
                    disabled={busy}
                    onClick={() => removePicked(p.key)}
                    className="absolute top-1 right-1"
                  >
                    <XIcon />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {picked.length} photo{picked.length === 1 ? "" : "s"} selected
          </p>
          <Button type="submit" disabled={busy}>
            {busy ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <SparklesIcon data-icon="inline-start" />
            )}
            {progress ?? "Sort by colour"}
          </Button>
          {error && <FieldError className="w-full">{error}</FieldError>}
        </CardContent>
      </Card>
    </form>
  )
}

/** Same colour name (any case) → same group, in the order colours first appear. */
function groupByColor(photos: Classified["photos"]): Group[] {
  const groups: Group[] = []
  for (const { color, ...photo } of photos) {
    const existing = groups.find((g) => g.name.toLowerCase() === color.toLowerCase())
    if (existing) existing.photos.push(photo)
    else groups.push({ key: nextKey(), name: color, quantities: {}, photos: [photo] })
  }
  // Fronts first inside each colour, like everywhere else.
  for (const g of groups)
    g.photos.sort((a, b) => (a.view === b.view ? 0 : a.view === "front" ? -1 : 1))
  return groups
}
