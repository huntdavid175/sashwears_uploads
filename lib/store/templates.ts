import "server-only"

import { randomUUID } from "node:crypto"

import { getDb, iso, isUniqueViolation } from "@/lib/db"
import { MODEL_CAPS } from "@/lib/models"
import { MAX_SHOT_NAME, MAX_SHOTS, shotKey } from "@/lib/shoot"
import {
  MODEL_IDS,
  OUTPUT_FORMATS,
  QUALITIES,
  TEMPLATE_KINDS,
  type StoredImage,
  type Template,
  type TemplateKind,
  type TemplateSettings,
  type TemplateShot,
} from "@/lib/types"

import { StoreError } from "./errors"

export const TEMPLATE_DEFAULTS: Omit<TemplateSettings, "prompt"> & { kind: TemplateKind } = {
  kind: "model",
  model: "gpt-image-2",
  quality: "high",
  outputFormat: "png",
}

export type TemplateInput = Partial<TemplateSettings> & { name?: string; kind?: TemplateKind }

/**
 * A template's photos: its shots (name + reference each, keys made from the names), or the
 * background of an older template.
 */
export type TemplateImages = {
  shots?: { name: string; reference: StoredImage }[]
  reference?: StoredImage
}

type Row = {
  id: string
  name: string
  slug: string
  prompt: string
  kind: TemplateKind
  model: Template["model"]
  quality: Template["quality"]
  output_format: Template["outputFormat"]
  reference: StoredImage | null
  shots: TemplateShot[] | null
  is_default: boolean
  created_at: unknown
  updated_at: unknown
}

function toTemplate(r: Row): Template {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    prompt: r.prompt,
    kind: r.kind,
    model: r.model,
    quality: r.quality,
    outputFormat: r.output_format,
    shots: r.shots ?? [],
    reference: r.reference ?? undefined,
    isDefault: r.is_default,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  }
}

export async function listTemplates(): Promise<Template[]> {
  const rows = await getDb().query<Row>(
    "SELECT * FROM templates ORDER BY is_default DESC, updated_at DESC",
  )
  return rows.map(toTemplate)
}

export async function getTemplate(id: string): Promise<Template> {
  if (!isUuid(id)) throw new StoreError("not_found", "Template not found")
  const [row] = await getDb().query<Row>("SELECT * FROM templates WHERE id = $1", [id])
  if (!row) throw new StoreError("not_found", "Template not found")
  return toTemplate(row)
}

/** New templates need at least one shot, or (older kind) a background. */
export async function createTemplate(
  input: TemplateInput,
  images: TemplateImages,
): Promise<Template> {
  const fields = validate({ ...TEMPLATE_DEFAULTS, ...input })
  const shots = validateImages(images)
  const slug = await uniqueSlug(fields.name)
  const rows = await saving(fields.name, () =>
    getDb().query<Row>(
      `INSERT INTO templates (id, name, slug, prompt, kind, model, quality, output_format,
         reference, shots, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOT EXISTS (SELECT 1 FROM templates))
       RETURNING *`,
      [
        randomUUID(),
        fields.name,
        slug,
        fields.prompt,
        fields.kind,
        fields.model,
        fields.quality,
        fields.outputFormat,
        json(images.reference),
        json(shots),
      ],
    ),
  )
  return toTemplate(rows[0])
}

/** `images.shots` replaces the whole shot list; omitted, the shots stay as they are. */
export async function updateTemplate(
  id: string,
  input: TemplateInput,
  images: TemplateImages = {},
): Promise<Template> {
  const current = await getTemplate(id)
  const fields = validate({ ...current, ...input })
  const shots = validateImages({
    reference: images.reference ?? current.reference,
    shots: images.shots ?? current.shots,
  })
  const slug = sameName(fields.name, current.name)
    ? current.slug
    : await uniqueSlug(fields.name, id)
  const rows = await saving(fields.name, () =>
    getDb().query<Row>(
      `UPDATE templates SET name = $2, slug = $3, prompt = $4, kind = $5, model = $6,
         quality = $7, output_format = $8, reference = $9, shots = $10, updated_at = now()
       WHERE id = $1 RETURNING *`,
      [
        id,
        fields.name,
        slug,
        fields.prompt,
        fields.kind,
        fields.model,
        fields.quality,
        fields.outputFormat,
        json(images.reference ?? current.reference),
        json(shots),
      ],
    ),
  )
  if (!rows[0]) throw new StoreError("not_found", "Template not found")
  return toTemplate(rows[0])
}

/** The template new dresses are generated with: the marked default, else the only/newest one. */
export async function getDefaultTemplate(): Promise<Template> {
  const [row] = await getDb().query<Row>(
    "SELECT * FROM templates ORDER BY is_default DESC, updated_at DESC LIMIT 1",
  )
  if (!row) {
    throw new StoreError("invalid", "There's no template yet. Create one in Templates first.")
  }
  return toTemplate(row)
}

export async function setDefaultTemplate(id: string): Promise<void> {
  await getTemplate(id)
  await getDb().query("UPDATE templates SET is_default = (id = $1)", [id])
}

/** Jobs and dresses are kept, and so are the reference files (job snapshots point at them). */
export async function deleteTemplate(id: string): Promise<void> {
  if (!isUuid(id)) throw new StoreError("not_found", "Template not found")
  const rows = await getDb().query("DELETE FROM templates WHERE id = $1 RETURNING id", [id])
  if (!rows.length) throw new StoreError("not_found", "Template not found")
}

/** Shots with keys, checked: 1 to MAX_SHOTS, named, no two alike. `null` for older templates. */
function validateImages(images: TemplateImages): TemplateShot[] | null {
  const list = images.shots ?? []
  if (!list.length) {
    if (images.reference) return null
    throw new StoreError("invalid", "Add at least one shot with its photo")
  }
  if (list.length > MAX_SHOTS) throw new StoreError("invalid", `Up to ${MAX_SHOTS} shots`)
  const seen = new Set<string>()
  return list.map((shot) => {
    const name = shot.name.replace(/\s+/g, " ").trim().slice(0, MAX_SHOT_NAME)
    if (!name) throw new StoreError("invalid", "Every shot needs a name")
    const key = shotKey(name)
    if (seen.has(key)) throw new StoreError("invalid", `"${name}" is listed twice`)
    seen.add(key)
    return { key, name, reference: shot.reference }
  })
}

const json = (value: object | null | undefined) => (value ? JSON.stringify(value) : null)

function validate(input: TemplateInput): TemplateSettings & { name: string; kind: TemplateKind } {
  const name = input.name?.trim() ?? ""
  const prompt = input.prompt?.trim() ?? ""
  if (!name) throw new StoreError("invalid", "Name is required")
  if (name.length > 80) throw new StoreError("invalid", "Name must be 80 characters or fewer")
  if (!prompt) throw new StoreError("invalid", "Prompt is required")
  if (!TEMPLATE_KINDS.includes(input.kind!)) throw new StoreError("invalid", "Unknown kind")
  if (!MODEL_IDS.includes(input.model!)) throw new StoreError("invalid", "Unknown model")
  if (!QUALITIES.includes(input.quality!)) throw new StoreError("invalid", "Unknown quality")
  if (!MODEL_CAPS[input.model!].qualities.includes(input.quality!)) {
    throw new StoreError("invalid", `${input.model} doesn't support "${input.quality}" quality`)
  }
  if (!OUTPUT_FORMATS.includes(input.outputFormat!)) {
    throw new StoreError("invalid", "Unknown output format")
  }
  return {
    name,
    prompt,
    kind: input.kind!,
    model: input.model!,
    quality: input.quality!,
    outputFormat: input.outputFormat!,
  }
}

/** The unique index on lower(name) is the real duplicate check; turn it into a 409. */
async function saving<T>(name: string, write: () => Promise<T>): Promise<T> {
  try {
    return await write()
  } catch (err) {
    if (isUniqueViolation(err, "templates_name_key")) {
      throw new StoreError("conflict", `A template named "${name}" already exists`)
    }
    throw err
  }
}

function sameName(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

export function isUuid(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}

export function slugify(name: string, fallback = "template") {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || fallback
  )
}

async function uniqueSlug(name: string, exceptId?: string) {
  const base = slugify(name)
  const rows = await getDb().query<{ slug: string }>(
    `SELECT slug FROM templates
     WHERE (slug = $1 OR slug LIKE $1 || '-%') AND id IS DISTINCT FROM $2::uuid`,
    [base, exceptId ?? null],
  )
  const taken = new Set(rows.map((r) => r.slug))
  let slug = base
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`
  return slug
}
