"use client"

import { ImagePlusIcon, PlusIcon, XIcon } from "lucide-react"
import { useEffect, useId, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"

/** What the edit API accepts; iOS converts camera HEIC to JPEG when HEIC isn't listed. */
export const PHOTO_ACCEPT = "image/png,image/jpeg,image/webp"

/** A labelled tap target that holds one photo, with a preview. */
export function PhotoSlot({
  label,
  file,
  onChange,
  disabled,
  invalid,
}: {
  label: string
  file: File | null
  onChange: (file: File | null) => void
  disabled?: boolean
  invalid?: boolean
}) {
  const id = useId()
  // Object URL for the chosen file, freed when it changes or the slot unmounts.
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview])

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="relative">
        <label
          htmlFor={id}
          aria-invalid={invalid || undefined}
          className={cn(
            "flex aspect-[3/4] cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border border-dashed bg-muted/50 text-center text-xs text-muted-foreground hover:border-primary has-focus-visible:ring-3 has-focus-visible:ring-ring/50 aria-invalid:border-destructive",
            file && "border-solid",
            disabled && "pointer-events-none opacity-60",
          )}
        >
          {file && preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- local blob preview
            <img src={preview} alt={label} className="size-full object-cover" />
          ) : (
            <>
              <ImagePlusIcon />
              <span>Add photo</span>
            </>
          )}
          <input
            id={id}
            type="file"
            accept={PHOTO_ACCEPT}
            disabled={disabled}
            className="sr-only"
            onChange={(e) => {
              onChange(e.target.files?.[0] ?? null)
              e.target.value = ""
            }}
          />
        </label>
        {file && !disabled && (
          <Button
            type="button"
            size="icon-xs"
            variant="secondary"
            aria-label={`Remove ${label.toLowerCase()}`}
            onClick={() => onChange(null)}
            className="absolute top-1.5 right-1.5"
          >
            <XIcon />
          </Button>
        )}
      </div>
    </div>
  )
}

/** Pick which sizes the dress comes in; the standard ones plus any added. */
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

/** One number box per size. Blank means 0. */
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
  if (!sizes.length) {
    return <p className="text-sm text-muted-foreground">Pick the sizes above first.</p>
  }
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2">
      {sizes.map((size) => (
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
