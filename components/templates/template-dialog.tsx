"use client"

import { ImagePlusIcon, PlusIcon, XIcon } from "lucide-react"
import { useEffect, useId, useMemo, useState } from "react"

import { nextKey } from "@/components/photos/photo-drop"
import { PHOTO_ACCEPT } from "@/components/products/fields"
import { KIND_LABELS } from "@/components/shoots/kind-tag"
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
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
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
import { MAX_SHOT_NAME, MAX_SHOTS } from "@/lib/shoot"
import {
  MODEL_IDS,
  OUTPUT_FORMATS,
  TEMPLATE_KINDS,
  type ModelId,
  type OutputFormat,
  type Quality,
  type StoredImage,
  type Template,
  type TemplateKind,
} from "@/lib/types"
import { cn } from "@/lib/utils"

const MODEL_ITEMS = MODEL_IDS.map((id) => ({ value: id, label: MODEL_CAPS[id].label }))

const QUALITY_LABELS: Record<Quality, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max",
}

const FORMAT_LABELS: Record<OutputFormat, string> = { png: "PNG", jpeg: "JPEG", webp: "WebP" }

/** Shots to add with one tap. */
const SUGGESTED_SHOTS = ["Front", "Back", "Side", "Inside", "Three-quarter", "Detail"]

const KIND_HELP: Record<TemplateKind, string> = {
  model:
    "Your model, photographed once per shot in the same place and light: facing the camera, facing away… Clothes are worn, bags held or carried.",
  scene:
    "The setting, photographed once per shot: a table, a shelf, a backdrop. The product is placed into it on its own.",
}

/** One shot being edited: a new photo, or the saved one (`key` + `current`). */
type ShotRow = { id: string; name: string; file: File | null; key?: string; current?: StoredImage }

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
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
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
  const [kind, setKind] = useState<TemplateKind>(template?.kind ?? "model")
  const [prompt, setPrompt] = useState(template?.prompt ?? "")
  const [model, setModel] = useState<ModelId>(template?.model ?? "gpt-image-2")
  const [quality, setQuality] = useState<Quality>(template?.quality ?? "high")
  const [format, setFormat] = useState<OutputFormat>(template?.outputFormat ?? "png")
  const [shots, setShots] = useState<ShotRow[]>(() =>
    template?.shots.length
      ? template.shots.map((s) => ({
          id: nextKey(),
          name: s.name,
          file: null,
          key: s.key,
          current: s.reference,
        }))
      : ["Front", "Back"].map((n) => ({ id: nextKey(), name: n, file: null })),
  )
  const [attempted, setAttempted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const caps = MODEL_CAPS[model]
  const taken = new Set(shots.map((s) => s.name.trim().toLowerCase()))

  function changeModel(next: ModelId) {
    setModel(next)
    if (!MODEL_CAPS[next].qualities.includes(quality)) setQuality("high")
  }

  function updateShot(rowId: string, patch: Partial<ShotRow>) {
    setShots((list) => list.map((s) => (s.id === rowId ? { ...s, ...patch } : s)))
  }

  function addShot(shotName = "") {
    setShots((list) => [...list, { id: nextKey(), name: shotName, file: null }])
  }

  function problem() {
    if (!shots.length) return "Add at least one shot."
    const names = new Set<string>()
    for (const s of shots) {
      const n = s.name.trim().toLowerCase()
      if (!n) return "Name every shot."
      if (names.has(n)) return `"${s.name.trim()}" is listed twice.`
      names.add(n)
      if (!s.file && !s.current) return `Add a photo for the ${s.name.trim()} shot.`
    }
    return null
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setAttempted(true)
    const issue = problem()
    setError(issue)
    if (issue) return
    setSaving(true)
    try {
      const uploaded = await Promise.all(
        shots.map((s) => (s.file ? uploadToImageKit(s.file, "references") : null)),
      )
      const saved = await api<Template>(
        template ? `/api/templates/${template.id}` : "/api/templates",
        {
          method: template ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            kind,
            prompt,
            model,
            quality,
            outputFormat: format,
            shots: shots.map((s, i) =>
              uploaded[i] ? { name: s.name, fileId: uploaded[i] } : { name: s.name, key: s.key },
            ),
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
    <form onSubmit={save} className="flex flex-col gap-5" noValidate>
      <DialogHeader>
        <DialogTitle>{template ? "Edit template" : "New template"}</DialogTitle>
        <DialogDescription>
          A look, and the shots every colour of a product gets in it.
        </DialogDescription>
      </DialogHeader>

      <FieldGroup className="gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
            <Input
              id={`${id}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={kind === "model" ? "Ama in the white studio" : "Marble table, morning"}
              maxLength={80}
              required
            />
          </Field>
          <Field>
            <FieldLabel>Kind</FieldLabel>
            <ToggleGroup
              variant="outline"
              spacing={0}
              value={[kind]}
              onValueChange={(v) => v[0] && setKind(v[0] as TemplateKind)}
              className="w-full"
            >
              {TEMPLATE_KINDS.map((k) => (
                <ToggleGroupItem key={k} value={k} className="flex-1">
                  {KIND_LABELS[k]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
        </div>

        <FieldSet>
          <FieldLegend variant="label">Shots</FieldLegend>
          <FieldDescription>{KIND_HELP[kind]}</FieldDescription>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {shots.map((s, i) => (
              <ShotSlot
                key={s.id}
                row={s}
                index={i}
                disabled={saving}
                invalid={attempted && (!s.name.trim() || (!s.file && !s.current))}
                onChange={(patch) => updateShot(s.id, patch)}
                onRemove={() => setShots((list) => list.filter((x) => x.id !== s.id))}
              />
            ))}
            {shots.length < MAX_SHOTS && (
              <li>
                <button
                  type="button"
                  onClick={() => addShot()}
                  disabled={saving}
                  className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-input text-sm text-muted-foreground outline-none hover:border-primary hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <PlusIcon className="size-5" />
                  Add a shot
                </button>
              </li>
            )}
          </ul>
          {shots.length < MAX_SHOTS && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-1 text-xs text-muted-foreground">Quick add:</span>
              {SUGGESTED_SHOTS.filter((n) => !taken.has(n.toLowerCase())).map((n) => (
                <Button
                  key={n}
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => addShot(n)}
                  disabled={saving}
                >
                  <PlusIcon data-icon="inline-start" />
                  {n}
                </Button>
              ))}
            </div>
          )}
        </FieldSet>

        <Field>
          <FieldLabel htmlFor={`${id}-prompt`}>How it should look</FieldLabel>
          <Textarea
            id={`${id}-prompt`}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              kind === "model"
                ? "Soft daylight, barefoot, hair tied back, a natural relaxed pose."
                : "Morning light from the left, soft shadows, the bag centred on the table."
            }
            rows={3}
            required
          />
          <FieldDescription>
            Added to every image. The app already tells the AI to keep the product exactly as it is.
          </FieldDescription>
        </Field>

        <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto]">
          <Field>
            <FieldLabel htmlFor={`${id}-model`}>AI model</FieldLabel>
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
        </div>
      </FieldGroup>

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

/** One shot: its photo (tap to choose), its name, remove. */
function ShotSlot({
  row,
  index,
  disabled,
  invalid,
  onChange,
  onRemove,
}: {
  row: ShotRow
  index: number
  disabled?: boolean
  invalid?: boolean
  onChange: (patch: Partial<ShotRow>) => void
  onRemove: () => void
}) {
  const id = useId()
  const blob = useMemo(() => (row.file ? URL.createObjectURL(row.file) : null), [row.file])
  useEffect(() => () => void (blob && URL.revokeObjectURL(blob)), [blob])
  const preview = blob ?? (row.current ? imageUrl(row.current, { width: 360 }) : null)
  const label = row.name.trim() || `Shot ${index + 1}`

  return (
    <li className="flex flex-col gap-1.5">
      <div className="relative">
        <label
          htmlFor={`${id}-file`}
          aria-invalid={invalid || undefined}
          className={cn(
            "relative flex aspect-[3/4] cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-sm border border-dashed border-input bg-muted p-2 text-center text-xs text-muted-foreground hover:border-primary has-focus-visible:ring-3 has-focus-visible:ring-ring/50 aria-invalid:border-destructive",
            preview && "border-solid",
            disabled && "pointer-events-none opacity-60",
          )}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- local blob / ImageKit preview
            <img src={preview} alt={label} className="absolute inset-0 size-full object-cover" />
          ) : (
            <>
              <ImagePlusIcon />
              <span>Add the {label.toLowerCase()} photo</span>
            </>
          )}
          <input
            id={`${id}-file`}
            type="file"
            accept={PHOTO_ACCEPT}
            disabled={disabled}
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onChange({ file })
              e.target.value = ""
            }}
          />
        </label>
        <Button
          type="button"
          size="icon-xs"
          variant="secondary"
          aria-label={`Remove the ${label} shot`}
          disabled={disabled}
          onClick={onRemove}
          className="absolute top-1 right-1"
        >
          <XIcon />
        </Button>
      </div>
      <Input
        value={row.name}
        onChange={(e) => onChange({ name: e.target.value })}
        maxLength={MAX_SHOT_NAME}
        placeholder="Shot name"
        aria-label={`Shot ${index + 1} name`}
        aria-invalid={invalid && !row.name.trim() ? true : undefined}
        disabled={disabled}
        className="h-8"
      />
    </li>
  )
}
