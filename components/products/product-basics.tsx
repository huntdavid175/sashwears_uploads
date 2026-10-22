"use client"

import { useId, useState } from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { CURRENCY_SYMBOL, DEFAULT_SIZES } from "@/lib/dress"

import { SizePicker } from "./fields"

/** Price, sizes and note: the part of a product that's the same for every colour. */
export function useProductBasics() {
  const [price, setPrice] = useState("")
  const [sizeOptions, setSizeOptions] = useState(DEFAULT_SIZES)
  // Nothing picked at first: a bag has no sizes; clothing gets the ones it actually comes in.
  const [sizes, setSizes] = useState<string[]>([])
  const [note, setNote] = useState("")
  return {
    price,
    setPrice,
    sizeOptions,
    addSizeOption: (size: string) => setSizeOptions((o) => [...o, size]),
    sizes,
    setSizes,
    note,
    setNote,
  }
}

export type ProductBasics = ReturnType<typeof useProductBasics>

export function ProductBasicsCard({
  basics,
  busy,
  attempted,
}: {
  basics: ProductBasics
  busy: boolean
  /** Show the price as invalid once the owner has tried to continue. */
  attempted: boolean
}) {
  const id = useId()
  const priceMissing = attempted && !basics.price.trim() ? true : undefined

  return (
    <Card size="sm">
      <CardHeader className="border-b">
        <CardTitle>Price and sizes</CardTitle>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field data-invalid={priceMissing}>
            <FieldLabel htmlFor={`${id}-price`}>Price ({CURRENCY_SYMBOL})</FieldLabel>
            <Input
              id={`${id}-price`}
              value={basics.price}
              onChange={(e) => basics.setPrice(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              disabled={busy}
              aria-invalid={priceMissing}
              className="max-w-48"
            />
            <FieldDescription>One price for every colour and size.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>Sizes</FieldLabel>
            <SizePicker
              options={basics.sizeOptions}
              value={basics.sizes}
              onChange={basics.setSizes}
              onAddOption={basics.addSizeOption}
              disabled={busy}
            />
            <FieldDescription>
              {basics.sizes.length
                ? `${basics.sizes.length} size${basics.sizes.length === 1 ? "" : "s"}: stock is counted per size.`
                : "None picked: one size (bags, accessories)."}
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-note`}>Note (optional)</FieldLabel>
            <Textarea
              id={`${id}-note`}
              value={basics.note}
              onChange={(e) => basics.setNote(e.target.value)}
              rows={2}
              maxLength={500}
              disabled={busy}
              placeholder="Anything to remember about this product"
            />
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}
