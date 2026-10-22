"use client"

import { PlusIcon } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { stockSizes } from "@/lib/dress"

/** What the edit API accepts; iOS converts camera HEIC to JPEG when HEIC isn't listed. */
export const PHOTO_ACCEPT = "image/png,image/jpeg,image/webp"

/** Pick which sizes the product comes in (none: one size); the standard ones plus any added. */
export function SizePicker({
  options,
  value,
  onChange,
  onAddOption,
  disabled,
}: {
  options: string[]
  value: string[]
  onChange: (sizes: string[]) => void
  onAddOption: (size: string) => void
  disabled?: boolean
}) {
  const [adding, setAdding] = useState("")

  function add() {
    const size = adding.replace(/\s+/g, " ").trim().slice(0, 40)
    setAdding("")
    if (!size) return
    if (!options.some((o) => o.toLowerCase() === size.toLowerCase())) onAddOption(size)
    const existing = options.find((o) => o.toLowerCase() === size.toLowerCase()) ?? size
    if (!value.includes(existing)) onChange([...value, existing])
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToggleGroup
        multiple
        variant="outline"
        spacing={0}
        value={value}
        // Keep sizes in the options' order, not the order they were tapped.
        onValueChange={(v) => onChange(options.filter((o) => v.includes(o)))}
        disabled={disabled}
        className="flex-wrap"
      >
        {options.map((size) => (
          <ToggleGroupItem key={size} value={size} aria-label={`Size ${size}`}>
            {size}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="flex items-center gap-1">
        <Input
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              add()
            }
          }}
          placeholder="Other size"
          aria-label="Add another size"
          disabled={disabled}
          className="w-28"
        />
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label="Add size"
          onClick={add}
          disabled={disabled || !adding.trim()}
        >
          <PlusIcon />
        </Button>
      </div>
    </div>
  )
}

/** One number box per size (one box, "One size", when there are none). Blank means 0. */
export function QuantityGrid({
  sizes,
  value,
  onChange,
  disabled,
  label,
}: {
  sizes: string[]
  value: Record<string, string>
  onChange: (value: Record<string, string>) => void
  disabled?: boolean
  /** Prefix for each input's accessible name, e.g. the colour. */
  label: string
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2">
      {stockSizes(sizes).map((size) => (
        <label key={size} className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">{size}</span>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            placeholder="0"
            value={value[size] ?? ""}
            disabled={disabled}
            aria-label={`${label} quantity, size ${size}`}
            onChange={(e) => onChange({ ...value, [size]: e.target.value })}
          />
        </label>
      ))}
    </div>
  )
}
