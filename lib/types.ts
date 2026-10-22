export const MODEL_IDS = [
  "gpt-image-1",
  "gpt-image-1-mini",
  "gpt-image-1.5",
  "gpt-image-2",
  "gpt-image-2.5-sunburst",
  "gpt-image-2.5-flare",
] as const
export type ModelId = (typeof MODEL_IDS)[number]

export const QUALITIES = ["low", "medium", "high", "xhigh", "max"] as const
export type Quality = (typeof QUALITIES)[number]

export const OUTPUT_FORMATS = ["png", "jpeg", "webp"] as const
export type OutputFormat = (typeof OUTPUT_FORMATS)[number]

export const IMAGE_EXTS = ["png", "jpg", "jpeg", "webp"] as const
export type ImageExt = (typeof IMAGE_EXTS)[number]

export type TemplateSettings = {
  prompt: string
  model: ModelId
  quality: Quality
  outputFormat: OutputFormat
}

/** An image stored on ImageKit. */
export type StoredImage = {
  fileId: string
  /** e.g. "/backdrop-studio/studio/emerald-satin-wrap-midi-dress.png" */
  filePath: string
  url: string
  width: number
  height: number
  /** When this file was last written; used to bust browser caches after an overwrite. */
  updatedAt: string
}

/** A side or angle of a product, e.g. { key: "front", name: "Front" }. Keys name the files. */
export type Shot = { key: string; name: string }

/** model: the product worn or held by the template's model. scene: the item alone in a setting. */
export const TEMPLATE_KINDS = ["model", "scene"] as const
export type TemplateKind = (typeof TEMPLATE_KINDS)[number]

/** One shot a template makes, with its reference: the model in that pose, or the scene. */
export type TemplateShot = Shot & { reference: StoredImage }

export type Template = TemplateSettings & {
  id: string
  name: string
  slug: string
  kind: TemplateKind
  /** In order. Every colour of a set gets one image per shot. Empty on older templates. */
  shots: TemplateShot[]
  /** Background photo of templates made for the earlier "Needs editing" dresses. */
  reference?: StoredImage
  /** Picked first for new sets (and used to regenerate older dresses). */
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

/** Template state at the time a job was created, so later edits don't affect it. */
export type TemplateSnapshot = TemplateSettings &
  Pick<Template, "name" | "slug" | "reference" | "shots"> & { kind?: TemplateKind }

/** A template a set can use: it has at least one shot. */
export function isReady(t: Pick<Template, "shots">) {
  return t.shots.length > 0
}

export type JobStatus = "queued" | "processing" | "done" | "failed"

/**
 * One AI edit: of a product photo, or one image of a set. Regenerating adds a new job for it.
 */
export type Job = {
  id: string
  templateId: string
  templateSnapshot: TemplateSnapshot
  /** Original filename as uploaded. */
  originalName: string
  /** The uploaded product photo (a set image's first product photo). */
  source: StoredImage
  /** The product photo this edit is for. */
  photoId?: string
  /** The shoot image this edit is for. */
  shootImageId?: string
  /** Requested output size, e.g. "1024x1536". */
  size?: string
  status: JobStatus
  error?: string
  attempts: number
  createdAt: string
  startedAt?: string
  finishedAt?: string
}

/** A photo's shot key ("front", "back", "side"…). */
export type PhotoView = string

export type ProductPhoto = {
  id: string
  colorId: string
  view: PhotoView
  /** The store owner's photo. */
  source: StoredImage
  /** The edited result on ImageKit, at "<folder>/<handle>-<colour>-<view>.<ext>". */
  output?: StoredImage
  /** From the latest job for this photo. */
  status: JobStatus
  error?: string
  startedAt?: string
}

export type ProductColor = {
  id: string
  name: string
  position: number
  /** Stock per size, e.g. { S: 2, M: 3 }; one-size products use ONE_SIZE. Missing are 0. */
  quantities: Record<string, number>
  /** In shot order (front first). */
  photos: ProductPhoto[]
}

/** generating: edits still running · attention: an edit failed · ready: every photo done. */
export type ProductStatus = "generating" | "attention" | "ready"

/** generated: the app edits the photos · completed: uploaded already edited. */
export type ProductKind = "generated" | "completed"

/** One Shopify product (a dress, a bag…): Color (× Size) variants with one price. */
export type Product = {
  id: string
  kind: ProductKind
  /** AI-generated (no colour in it), editable. Unset until the first edit names it. */
  name?: string
  /** What it is, e.g. "Dress" or "Bag": Shopify's product type. */
  productType?: string
  /** Shopify URL handle and file name stem, e.g. "satin-wrap-midi-dress". */
  handle?: string
  /** In CURRENCY (lib/dress.ts), same for every colour and size. */
  price: number
  /** In display order, e.g. ["S", "M", "L", "XL", "XXL"]; empty for one-size products. */
  sizes: string[]
  note?: string
  templateId?: string
  exportedAt?: string
  createdAt: string
  updatedAt: string
  colors: ProductColor[]
  status: ProductStatus
}

/**
 * What a product photo tells a set edit. garment: this colour, this shot, copy it exactly.
 * colour: this colour from another shot, for colour and material only. design: another colour
 * from this shot, for the construction only (how a missing shot gets made).
 */
export type GarmentRole = "garment" | "colour" | "design"

export type ShootInput = {
  role: GarmentRole
  view: PhotoView
  /** The shot's display name, e.g. "Back". */
  viewName: string
  image: StoredImage
  /** The colour the photo shows (differs from the image's colour for "design"). */
  color: string
}

/** One generated image: one colour in one of the template's shots. */
export type ShootImage = {
  id: string
  color: string
  /** The shot key; `shotName` is how it reads. */
  view: PhotoView
  shotName: string
  inputs: ShootInput[]
  /** On ImageKit at "<folder>/<handle>-<colour>-<view>.<ext>". */
  output?: StoredImage
  /** From the latest job for this image. */
  status: JobStatus
  error?: string
  startedAt?: string
}

/** A set of images: every colour of one product in every shot of a template, in one folder. */
export type Shoot = {
  id: string
  /** AI-suggested, edited by the owner before generating. Names the folder and the files. */
  name: string
  handle: string
  description: string
  templateId?: string
  createdAt: string
  /** In the owner's order; the template's shot order inside each. */
  colors: { name: string; images: ShootImage[] }[]
  status: ProductStatus
}
