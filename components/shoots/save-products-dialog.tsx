"use client"

import { useId, useState } from "react"

import { ZoomImage } from "@/components/photos/zoom-image"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { saveShoot } from "@/lib/client"
import { CURRENCY_SYMBOL, parsePrice, stockSizes } from "@/lib/dress"
import { finishedColors } from "@/lib/shoot"
import type { Product, Shoot } from "@/lib/types"

type Row = {
  price: string
  stock: string
  productType: string
  tags: string
  saved?: Product
  error?: string
}

const validPrice = (price: string) => {
  try {
    parsePrice(price)
    return true
  } catch {
    return false
  }
}

/**
 * Save one set, or several, as products: each with its images, and what the AI can't know. The
 * stock is written in plain words; it stays on screen after saving, arranged, to check.
 */
export function SaveProductsDialog({
  shoots,
  open,
  onOpenChange,
  onSaved,
}: {
  shoots: Shoot[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        {/* Mounted only while open, so every opening starts clean. */}
        {open && <SaveForm shoots={shoots} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  )
}

function SaveForm({ shoots, onSaved }: { shoots: Shoot[]; onSaved: () => void }) {
  const id = useId()
  // The list as opened: rows stay put while saved ones refresh underneath.
  const [list] = useState(shoots)
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(
      shoots.map((s) => [
        s.id,
        { price: "", stock: "", productType: s.productType ?? "", tags: s.tags.join(", ") },
      ]),
    ),
  )
  const [attempted, setAttempted] = useState(false)
  const [saving, setSaving] = useState(false)

  const update = (shootId: string, patch: Partial<Row>) =>
    setRows((r) => ({ ...r, [shootId]: { ...r[shootId], ...patch } }))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setAttempted(true)
    const waiting = list.filter((s) => !rows[s.id].saved)
    if (waiting.some((s) => !validPrice(rows[s.id].price))) return
    setSaving(true)
    // One at a time: each copies its images in its own function call.
    let done = 0
    for (const shoot of waiting) {
      const { price, stock, productType, tags } = rows[shoot.id]
      try {
        update(shoot.id, { error: undefined })
        update(shoot.id, { saved: await saveShoot(shoot.id, { price, stock, productType, tags }) })
        done++
      } catch (err) {
        update(shoot.id, { error: (err as Error).message })
      }
    }
    setSaving(false)
    onSaved()
    if (done) {
      const what = done === 1 ? "1 product" : `${done} products`
      toast.add({ type: "success", title: `Saved ${what} to Products` })
    }
  }

  const left = list.filter((s) => !rows[s.id].saved).length

  return (
    <form onSubmit={save} className="flex flex-col gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{list.length === 1 ? "Save as product" : "Save as products"}</DialogTitle>
        <DialogDescription>
          Write the stock in your own words and the AI sorts it into colours and sizes. Anything you
          don&apos;t list gets 0.
        </DialogDescription>
      </DialogHeader>

      {list.map((shoot) => {
        const row = rows[shoot.id]
        const colors = finishedColors(shoot)
        const images = colors.flatMap((c) => c.images)
        const total = shoot.colors.reduce((n, c) => n + c.images.length, 0)
        const skipped = shoot.colors.filter((c) => !colors.some((x) => x.name === c.name))
        const missing = attempted && !row.saved && !validPrice(row.price) ? true : undefined
        return (
          <section
            key={shoot.id}
            aria-label={shoot.name}
            className="flex flex-col gap-3 border-t pt-3"
          >
            <div className="flex flex-col gap-0.5">
              <h3 className="flex items-center gap-1.5 font-bold">
                {shoot.name}
                {row.saved && <Badge variant="ink">Saved</Badge>}
              </h3>
              <p className="text-xs text-muted-foreground">
                {images.length} of {total} images
                {skipped.length > 0 &&
                  ` · left out, no images: ${skipped.map((c) => c.name).join(", ")}`}
              </p>
            </div>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-1.5">
              {images.map((image) => (
                <li key={image.id}>
                  <ZoomImage
                    image={image.output!}
                    alt={`${shoot.name}: ${image.color}, ${image.shotName}`}
                    width={160}
                    className="aspect-[3/4] w-full rounded-sm bg-muted object-cover"
                  />
                </li>
              ))}
            </ul>
            {row.saved ? (
              <SavedStock product={row.saved} />
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field data-invalid={missing}>
                    <FieldLabel htmlFor={`${id}-${shoot.id}-price`}>
                      Price ({CURRENCY_SYMBOL})
                    </FieldLabel>
                    <Input
                      id={`${id}-${shoot.id}-price`}
                      value={row.price}
                      onChange={(e) => update(shoot.id, { price: e.target.value })}
                      inputMode="decimal"
                      placeholder="0.00"
                      disabled={saving}
                      aria-invalid={missing}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${id}-${shoot.id}-type`}>Type</FieldLabel>
                    <Input
                      id={`${id}-${shoot.id}-type`}
                      value={row.productType}
                      onChange={(e) => update(shoot.id, { productType: e.target.value })}
                      maxLength={40}
                      placeholder="The AI fills this if empty"
                      disabled={saving}
                    />
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor={`${id}-${shoot.id}-stock`}>Stock</FieldLabel>
                  <Textarea
                    id={`${id}-${shoot.id}-stock`}
                    value={row.stock}
                    onChange={(e) => update(shoot.id, { stock: e.target.value })}
                    rows={2}
                    maxLength={2000}
                    placeholder={`e.g. ${stockExample(colors.map((c) => c.name))}`}
                    disabled={saving}
                  />
                  <FieldDescription>
                    Colours: {colors.map((c) => c.name).join(", ")}. No sizes mentioned means one
                    size.
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${id}-${shoot.id}-tags`}>Tags</FieldLabel>
                  <Input
                    id={`${id}-${shoot.id}-tags`}
                    value={row.tags}
                    onChange={(e) => update(shoot.id, { tags: e.target.value })}
                    placeholder="The AI suggests these if empty"
                    disabled={saving}
                  />
                  <FieldDescription>Separate with commas.</FieldDescription>
                </Field>
                {missing && <FieldError>Enter the price.</FieldError>}
                {row.error && <FieldError>{row.error}</FieldError>}
              </>
            )}
          </section>
        )
      })}

      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />} disabled={saving}>
          {left ? "Close" : "Done"}
        </DialogClose>
        {left > 0 && (
          <Button type="submit" disabled={saving}>
            {saving && <Spinner data-icon="inline-start" />}
            {saving ? "Saving…" : left === 1 ? "Save product" : `Save ${left} products`}
          </Button>
        )}
      </DialogFooter>
    </form>
  )
}

/** "3 black small, 2 white medium", in this product's own colours. */
function stockExample(colors: string[]) {
  const sizes = ["small", "medium", "large"]
  return colors
    .slice(0, 3)
    .map((c, i) => `${3 - i} ${c.toLowerCase()} ${sizes[i]}`)
    .join(", ")
}

/** How the AI arranged it, to check at a glance. */
function SavedStock({ product }: { product: Product }) {
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <ul className="flex flex-col gap-0.5">
        {product.colors.map((color) => (
          <li key={color.id}>
            <span className="font-bold">{color.name}:</span>{" "}
            {stockSizes(product.sizes)
              .map((size) => `${size} ${color.quantities[size] ?? 0}`)
              .join(" · ")}
          </li>
        ))}
      </ul>
      {product.tags.length > 0 && (
        <span className="flex flex-wrap gap-1">
          {product.tags.map((tag) => (
            <Badge key={tag} variant="outline">
              {tag}
            </Badge>
          ))}
        </span>
      )}
    </div>
  )
}
