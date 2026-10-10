"use client"

import { useId, useState } from "react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { CURRENCY, DEFAULT_SIZES } from "@/lib/dress"

import { SizePicker } from "./fields"

/** Price, sizes and note: the part of a dress that's the same for every colour. */
export function useDressBasics() {
  const [price, setPrice] = useState("")
  const [sizeOptions, setSizeOptions] = useState(DEFAULT_SIZES)
  // Nothing picked at first: the owner chooses the sizes this dress actually comes in.
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

export type DressBasics = ReturnType<typeof useDressBasics>

export function DressBasicsCard({
  basics,
  busy,
  attempted,
}: {
  basics: DressBasics
  busy: boolean
  /** Show the price as invalid once the owner has tried to continue. */
  attempted: boolean
}) {
  const id = useId()
  const priceMissing = attempted && !basics.price.trim() ? true : undefined

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dress</CardTitle>
        <CardDescription>One price for every colour and size.</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field data-invalid={priceMissing}>
            <FieldLabel htmlFor={`${id}-price`}>Price ({CURRENCY})</FieldLabel>
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
          </Field>
          <Field data-invalid={attempted && !basics.sizes.length ? true : undefined}>
            <FieldLabel>Sizes it comes in</FieldLabel>
            <SizePicker
              options={basics.sizeOptions}
              value={basics.sizes}
              onChange={basics.setSizes}
              onAddOption={basics.addSizeOption}
              disabled={busy}
            />
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
              placeholder="Anything I should know about this dress"
            />
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}
