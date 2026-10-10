"use client"

import { XIcon } from "lucide-react"
import { useId, useState } from "react"

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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { CURRENCY, MAX_COLORS, normalizeColors, parsePrice } from "@/lib/dress"
import type { Job } from "@/lib/types"

export type DressInput = { name: string; colors: string[]; price: number | null }

export function DressDialog({
  job,
  open,
  onOpenChange,
  onSave,
}: {
  job: Job
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Resolves true once saved, so the dialog can close. */
  onSave: (job: Job, input: DressInput) => Promise<boolean>
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Mounted only while open, so every opening starts from the saved values. */}
        {open && (
          <DressForm
            job={job}
            onSave={async (input) => {
              if (await onSave(job, input)) onOpenChange(false)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function DressForm({ job, onSave }: { job: Job; onSave: (input: DressInput) => Promise<void> }) {
  const id = useId()
  const [name, setName] = useState(job.name ?? "")
  const [colors, setColors] = useState(job.colors)
  const [draft, setDraft] = useState("")
  const [price, setPrice] = useState(job.price === undefined ? "" : String(job.price))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  /** Commit whatever is typed (commas split it into several colors). */
  function addDraft(current = colors) {
    if (!draft.trim()) return current
    const next = normalizeColors([...current, ...draft.split(",")]).slice(0, MAX_COLORS)
    setColors(next)
    setDraft("")
    return next
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    let input: DressInput
    try {
      input = { name: name.trim(), colors: addDraft(), price: parsePrice(price.trim()) }
    } catch (err) {
      setError((err as Error).message)
      return
    }
    if (!input.name) {
      setError("Name can't be empty")
      return
    }
    setSaving(true)
    setError(null)
    await onSave(input)
    setSaving(false)
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <DialogHeader>
        <DialogTitle>Dress details</DialogTitle>
        <DialogDescription>
          Changing the name also renames the image file on ImageKit.
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
            required
          />
        </Field>

        <Field>
          <FieldLabel htmlFor={`${id}-colors`}>Available colors</FieldLabel>
          {colors.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="Colors">
              {colors.map((c) => (
                <li key={c}>
                  <Badge variant="secondary" className="gap-1 pr-1">
                    {c}
                    <button
                      type="button"
                      aria-label={`Remove ${c}`}
                      className="rounded-full p-0.5 hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                      onClick={() => setColors((list) => list.filter((x) => x !== c))}
                    >
                      <XIcon className="size-3" />
                    </button>
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          <Input
            id={`${id}-colors`}
            value={draft}
            placeholder={colors.length ? "Add another…" : "e.g. Black, Emerald, Wine"}
            disabled={colors.length >= MAX_COLORS}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === ",") && draft.trim()) {
                e.preventDefault()
                addDraft()
              } else if (e.key === "Backspace" && !draft && colors.length) {
                setColors((list) => list.slice(0, -1))
              }
            }}
            onBlur={() => addDraft()}
          />
          <FieldDescription>Press Enter or type a comma after each color.</FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor={`${id}-price`}>Price ({CURRENCY})</FieldLabel>
          <Input
            id={`${id}-price`}
            value={price}
            inputMode="decimal"
            placeholder="0.00"
            onChange={(e) => setPrice(e.target.value)}
          />
          <FieldDescription>Leave blank if it isn&apos;t priced yet.</FieldDescription>
        </Field>
      </FieldGroup>

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
