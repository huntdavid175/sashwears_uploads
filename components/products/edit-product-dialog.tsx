"use client"

import { useId, useState } from "react"

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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldLegend,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { api } from "@/lib/client"
import { CURRENCY_SYMBOL, DEFAULT_SIZES } from "@/lib/dress"
import type { Product } from "@/lib/types"

import { QuantityGrid, SizePicker } from "./fields"

export function EditProductDialog({
  product,
  open,
  onOpenChange,
  onSaved,
}: {
  product: Product
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (product: Product) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        {/* Mounted only while open, so every opening starts from the saved values. */}
        {open && (
          <EditForm
            product={product}
            onSaved={(p) => {
              onSaved(p)
              onOpenChange(false)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function EditForm({ product, onSaved }: { product: Product; onSaved: (p: Product) => void }) {
  const id = useId()
  const [name, setName] = useState(product.name ?? "")
  const [productType, setProductType] = useState(product.productType ?? "")
  const [price, setPrice] = useState(product.price.toFixed(2))
  const [sizeOptions, setSizeOptions] = useState(() => [
    ...DEFAULT_SIZES,
    ...product.sizes.filter((s) => !DEFAULT_SIZES.includes(s)),
  ])
  const [sizes, setSizes] = useState(product.sizes)
  const [colors, setColors] = useState(() =>
    product.colors.map((c) => ({
      id: c.id,
      name: c.name,
      quantities: Object.fromEntries(Object.entries(c.quantities).map(([k, v]) => [k, String(v)])),
    })),
  )
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      onSaved(
        await api<Product>(`/api/products/${product.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(product.name || name.trim() ? { name } : {}),
            productType,
            price,
            sizes,
            colors,
          }),
        }),
      )
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-6">
      <DialogHeader>
        <DialogTitle>Edit product</DialogTitle>
        <DialogDescription>
          Renaming the product or a colour also renames its photo files on ImageKit.
        </DialogDescription>
      </DialogHeader>

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
          <Input
            id={`${id}-name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder={product.name ? undefined : "Being named by AI…"}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-type`}>Type</FieldLabel>
          <Input
            id={`${id}-type`}
            value={productType}
            onChange={(e) => setProductType(e.target.value)}
            maxLength={40}
            placeholder="Dress, Tote Bag…"
            className="max-w-64"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-price`}>Price ({CURRENCY_SYMBOL})</FieldLabel>
          <Input
            id={`${id}-price`}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
            className="max-w-48"
          />
        </Field>
        <Field>
          <FieldLabel>Sizes</FieldLabel>
          <SizePicker
            options={sizeOptions}
            value={sizes}
            onChange={setSizes}
            onAddOption={(s) => setSizeOptions((o) => [...o, s])}
          />
          <FieldDescription>None picked: one size.</FieldDescription>
        </Field>
      </FieldGroup>

      {colors.map((c, i) => (
        <div key={c.id} className="flex flex-col gap-4">
          <Separator />
          <FieldSet>
            <FieldLegend>Colour {i + 1}</FieldLegend>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor={`${id}-${c.id}`}>Name</FieldLabel>
                <Input
                  id={`${id}-${c.id}`}
                  value={c.name}
                  maxLength={40}
                  className="max-w-64"
                  onChange={(e) =>
                    setColors((list) =>
                      list.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)),
                    )
                  }
                />
              </Field>
              <Field>
                <FieldLabel>Stock</FieldLabel>
                <QuantityGrid
                  sizes={sizes}
                  value={c.quantities}
                  label={c.name || `Colour ${i + 1}`}
                  onChange={(quantities) =>
                    setColors((list) => list.map((x) => (x.id === c.id ? { ...x, quantities } : x)))
                  }
                />
              </Field>
            </FieldGroup>
          </FieldSet>
        </div>
      ))}

      {error && <FieldError>{error}</FieldError>}

      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" disabled={saving}>
          {saving && <Spinner data-icon="inline-start" />}
          Save
        </Button>
      </DialogFooter>
    </form>
  )
}
