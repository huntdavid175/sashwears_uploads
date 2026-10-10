"use client"

import { PlusIcon, Trash2Icon } from "lucide-react"
import Link from "next/link"
import { useId, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { api, uploadToImageKit } from "@/lib/client"
import { CURRENCY, DEFAULT_SIZES, MAX_COLORS, parsePrice } from "@/lib/dress"
import type { Product } from "@/lib/types"

import { PhotoSlot, QuantityGrid, SizePicker } from "./fields"
import { RecentDresses } from "./recent-dresses"

type ColorDraft = {
  key: string
  name: string
  quantities: Record<string, string>
  front: File | null
  /** Only the first colour has a back photo. */
  back: File | null
}

// React list keys only (not used in ids), so a counter is enough and stays prerender-safe.
let colorKeys = 0
const newColor = (): ColorDraft => ({
  key: `colour-${++colorKeys}`,
  name: "",
  quantities: {},
  front: null,
  back: null,
})

/** Photos uploaded to ImageKit at once. */
const PARALLEL = 3

export function NewDressPage() {
  // Remounting the form (new key) after a submit clears it without reset effects.
  const [formKey, setFormKey] = useState(0)
  const [lastSubmitted, setLastSubmitted] = useState<Product | null>(null)

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-4 md:p-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">New dress</h1>
        <p className="text-muted-foreground">
          Add the price, sizes and every colour. The first colour needs a front and a back photo;
          other colours just a front.
        </p>
      </header>

      <NewDressForm
        key={formKey}
        onSubmitted={(product) => {
          setLastSubmitted(product)
          setFormKey((k) => k + 1)
          window.scrollTo({ top: 0, behavior: "smooth" })
        }}
      />

      <RecentDresses highlight={lastSubmitted?.id} />
    </main>
  )
}

function NewDressForm({ onSubmitted }: { onSubmitted: (product: Product) => void }) {
  const id = useId()
  const [price, setPrice] = useState("")
  const [sizeOptions, setSizeOptions] = useState(DEFAULT_SIZES)
  const [sizes, setSizes] = useState(DEFAULT_SIZES)
  const [note, setNote] = useState("")
  const [colors, setColors] = useState<ColorDraft[]>([newColor()])
  const [error, setError] = useState<string | null>(null)
  const [attempted, setAttempted] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const busy = progress !== null

  const photoCount = colors.length + 1

  function updateColor(key: string, patch: Partial<ColorDraft>) {
    setColors((list) => list.map((c) => (c.key === key ? { ...c, ...patch } : c)))
  }

  /** First problem in the form, in reading order, or null. */
  function problem(): string | null {
    try {
      parsePrice(price)
    } catch {
      return "Enter the price."
    }
    if (!sizes.length) return "Pick at least one size."
    const seen = new Set<string>()
    for (const [i, c] of colors.entries()) {
      const name = c.name.trim()
      const label = name || `Colour ${i + 1}`
      if (!name) return `Name colour ${i + 1}.`
      if (seen.has(name.toLowerCase())) return `"${name}" is listed twice.`
      seen.add(name.toLowerCase())
      if (!c.front) return `Add the front photo for ${label}.`
      if (i === 0 && !c.back) return `Add the back photo for ${label}.`
    }
    return null
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setAttempted(true)
    const issue = problem()
    setError(issue)
    if (issue) return

    // Upload every photo straight to ImageKit, a few at a time.
    const files = colors.flatMap((c, i) => [
      { color: c.key, view: "front" as const, file: c.front! },
      ...(i === 0 ? [{ color: c.key, view: "back" as const, file: c.back! }] : []),
    ])
    const uploaded = new Map<string, { fileId: string; originalName: string }>()
    let done = 0
    setProgress(`Uploading photos 0 of ${files.length}…`)
    try {
      const queue = [...files]
      await Promise.all(
        Array.from({ length: PARALLEL }, async () => {
          for (let f = queue.shift(); f; f = queue.shift()) {
            const fileId = await uploadToImageKit(f.file, "sources")
            uploaded.set(`${f.color}:${f.view}`, { fileId, originalName: f.file.name })
            setProgress(`Uploading photos ${++done} of ${files.length}…`)
          }
        }),
      )
      setProgress("Starting…")
      const product = await api<Product>("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          price,
          sizes,
          note,
          colors: colors.map((c) => ({
            name: c.name,
            quantities: c.quantities,
            front: uploaded.get(`${c.key}:front`),
            back: uploaded.get(`${c.key}:back`),
          })),
        }),
      })
      toast.add({
        type: "success",
        title: "Dress submitted",
        description: `Generating ${files.length} photo${files.length === 1 ? "" : "s"} now.`,
      })
      onSubmitted(product)
    } catch (err) {
      setError((err as Error).message)
      setProgress(null)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Dress</CardTitle>
          <CardDescription>One price for every colour and size.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field data-invalid={attempted && !price.trim() ? true : undefined}>
              <FieldLabel htmlFor={`${id}-price`}>Price ({CURRENCY})</FieldLabel>
              <Input
                id={`${id}-price`}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                disabled={busy}
                aria-invalid={attempted && !price.trim() ? true : undefined}
                className="max-w-48"
              />
            </Field>
            <Field>
              <FieldLabel>Sizes it comes in</FieldLabel>
              <SizePicker
                options={sizeOptions}
                value={sizes}
                onChange={setSizes}
                onAddOption={(size) => setSizeOptions((o) => [...o, size])}
                disabled={busy}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-note`}>Note (optional)</FieldLabel>
              <Textarea
                id={`${id}-note`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={500}
                disabled={busy}
                placeholder="Anything I should know about this dress"
              />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      {colors.map((c, i) => (
        <Card key={c.key}>
          <CardHeader>
            <CardTitle>Colour {i + 1}</CardTitle>
            <CardDescription>{i === 0 ? "Front and back photos" : "Front photo"}</CardDescription>
            {i > 0 && (
              <CardAction>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Remove colour ${i + 1}`}
                  disabled={busy}
                  onClick={() => setColors((list) => list.filter((x) => x.key !== c.key))}
                >
                  <Trash2Icon />
                </Button>
              </CardAction>
            )}
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field data-invalid={attempted && !c.name.trim() ? true : undefined}>
                <FieldLabel htmlFor={`${id}-colour-${i}-name`}>Colour name</FieldLabel>
                <Input
                  id={`${id}-colour-${i}-name`}
                  value={c.name}
                  onChange={(e) => updateColor(c.key, { name: e.target.value })}
                  placeholder={i === 0 ? "e.g. Black" : "e.g. Wine"}
                  maxLength={40}
                  disabled={busy}
                  aria-invalid={attempted && !c.name.trim() ? true : undefined}
                  className="max-w-64"
                />
              </Field>
              <div className="grid max-w-md grid-cols-2 gap-3">
                <PhotoSlot
                  label="Front"
                  file={c.front}
                  onChange={(front) => updateColor(c.key, { front })}
                  disabled={busy}
                  invalid={attempted && !c.front}
                />
                {i === 0 && (
                  <PhotoSlot
                    label="Back"
                    file={c.back}
                    onChange={(back) => updateColor(c.key, { back })}
                    disabled={busy}
                    invalid={attempted && !c.back}
                  />
                )}
              </div>
              <Field>
                <FieldLabel>Quantity per size</FieldLabel>
                <QuantityGrid
                  sizes={sizes}
                  value={c.quantities}
                  onChange={(quantities) => updateColor(c.key, { quantities })}
                  disabled={busy}
                  label={c.name.trim() || `Colour ${i + 1}`}
                />
                <FieldDescription>Leave a size blank if there are none.</FieldDescription>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>
      ))}

      <Button
        type="button"
        variant="outline"
        className="self-start"
        disabled={busy || colors.length >= MAX_COLORS}
        onClick={() => setColors((list) => [...list, newColor()])}
      >
        <PlusIcon data-icon="inline-start" />
        Add another colour
      </Button>

      <Card size="sm">
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            <Badge variant="secondary" className="mr-2">
              {photoCount} photos
            </Badge>
            will be generated with the shop background.
          </p>
          <Button type="submit" disabled={busy}>
            {busy && <Spinner data-icon="inline-start" />}
            {progress ?? "Submit dress"}
          </Button>
          {error && <FieldError className="w-full">{error}</FieldError>}
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        Submitted dresses appear under{" "}
        <Link href="/dresses" className="font-medium text-foreground underline underline-offset-4">
          Dresses
        </Link>
        .
      </p>
    </form>
  )
}
