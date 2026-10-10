"use client"

import { ImageIcon } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"

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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { api, imageUrl, uploadToImageKit } from "@/lib/client"
import { MODEL_CAPS } from "@/lib/models"
import {
  MODEL_IDS,
  OUTPUT_FORMATS,
  type ModelId,
  type OutputFormat,
  type Quality,
  type Template,
} from "@/lib/types"

const MODEL_ITEMS = MODEL_IDS.map((id) => ({ value: id, label: MODEL_CAPS[id].label }))

const QUALITY_LABELS: Record<Quality, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max",
}

const FORMAT_LABELS: Record<OutputFormat, string> = { png: "PNG", jpeg: "JPEG", webp: "WebP" }

export function TemplateDialog({
  open,
  onOpenChange,
  template,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present when editing. */
  template?: Template
  onSaved: (template: Template) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        {/* Mounted only while open, so every opening starts from the template's saved values. */}
        {open && (
          <TemplateForm
            template={template}
            onSaved={(t) => {
              onSaved(t)
              onOpenChange(false)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function TemplateForm({
  template,
  onSaved,
}: {
  template?: Template
  onSaved: (template: Template) => void
}) {
  const id = useId()
  const [name, setName] = useState(template?.name ?? "")
  const [prompt, setPrompt] = useState(template?.prompt ?? "")
  const [model, setModel] = useState<ModelId>(template?.model ?? "gpt-image-2")
  const [quality, setQuality] = useState<Quality>(template?.quality ?? "high")
  const [format, setFormat] = useState<OutputFormat>(template?.outputFormat ?? "png")
  const [reference, setReference] = useState<{ file: File; url: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Free the last preview URL when the form unmounts.
  const lastUrl = useRef<string | null>(null)
  useEffect(
    () => () => {
      if (lastUrl.current) URL.revokeObjectURL(lastUrl.current)
    },
    [],
  )

  function chooseReference(file: File | undefined) {
    if (lastUrl.current) URL.revokeObjectURL(lastUrl.current)
    const next = file ? { file, url: URL.createObjectURL(file) } : null
    lastUrl.current = next?.url ?? null
    setReference(next)
  }

  const preview = reference?.url ?? (template ? imageUrl(template.reference, { width: 600 }) : null)

  const caps = MODEL_CAPS[model]

  function changeModel(next: ModelId) {
    setModel(next)
    if (!MODEL_CAPS[next].qualities.includes(quality)) setQuality("high")
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!template && !reference) {
      setError("Choose a reference image for the background.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const referenceFileId = reference
        ? await uploadToImageKit(reference.file, "references")
        : undefined
      const saved = await api<Template>(
        template ? `/api/templates/${template.id}` : "/api/templates",
        {
          method: template ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            prompt,
            model,
            quality,
            outputFormat: format,
            referenceFileId,
          }),
        },
      )
      onSaved(saved)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-6">
      <DialogHeader>
        <DialogTitle>{template ? "Edit template" : "New template"}</DialogTitle>
        <DialogDescription>
          The reference photo sets the background. Every product photo you run through this template
          is placed into that scene.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-6 sm:grid-cols-[minmax(0,13rem)_1fr]">
        <Field>
          <FieldLabel htmlFor={`${id}-ref`}>Reference photo</FieldLabel>
          <label
            htmlFor={`${id}-ref`}
            className="relative flex aspect-[3/4] cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed bg-muted text-muted-foreground hover:border-primary has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- local blob/API image
              <img src={preview} alt="Reference background" className="size-full object-cover" />
            ) : (
              <span className="flex flex-col items-center gap-2 p-4 text-center text-sm">
                <ImageIcon />
                Choose a photo of the background you want
              </span>
            )}
            <input
              id={`${id}-ref`}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(e) => chooseReference(e.target.files?.[0])}
            />
          </label>
          <FieldDescription>
            {template ? "Choose a new photo to replace it." : "PNG, JPEG or WebP."}
          </FieldDescription>
        </Field>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
            <Input
              id={`${id}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Beach at golden hour"
              maxLength={80}
              required
            />
          </Field>

          <Field>
            <FieldLabel htmlFor={`${id}-prompt`}>Instructions</FieldLabel>
            <Textarea
              id={`${id}-prompt`}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Warm late-afternoon light, soft shadows on the sand, keep the horizon low."
              rows={4}
              required
            />
            <FieldDescription>
              Added to every edit. The app already tells the model to keep the product exactly as it
              is and copy the reference scene.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor={`${id}-model`}>Model</FieldLabel>
            <Select
              items={MODEL_ITEMS}
              value={model}
              onValueChange={(v) => v && changeModel(v as ModelId)}
            >
              <SelectTrigger id={`${id}-model`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {MODEL_ITEMS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {caps.note && <FieldDescription>{caps.note}</FieldDescription>}
          </Field>

          <Field>
            <FieldLabel>Quality</FieldLabel>
            <ToggleGroup
              variant="outline"
              spacing={0}
              value={[quality]}
              onValueChange={(v) => v[0] && setQuality(v[0] as Quality)}
              className="flex-wrap"
            >
              {caps.qualities.map((q) => (
                <ToggleGroupItem key={q} value={q}>
                  {QUALITY_LABELS[q]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <FieldDescription>
              Higher quality keeps more fabric detail and costs more.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel>File format</FieldLabel>
            <ToggleGroup
              variant="outline"
              spacing={0}
              value={[format]}
              onValueChange={(v) => v[0] && setFormat(v[0] as OutputFormat)}
            >
              {OUTPUT_FORMATS.map((f) => (
                <ToggleGroupItem key={f} value={f}>
                  {FORMAT_LABELS[f]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
        </FieldGroup>
      </div>

      {error && <FieldError>{error}</FieldError>}

      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" disabled={saving}>
          {saving && <Spinner data-icon="inline-start" />}
          {template ? "Save changes" : "Create template"}
        </Button>
      </DialogFooter>
    </form>
  )
}
