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

export type Template = TemplateSettings & {
  id: string
  name: string
  slug: string
  /** Background reference photo. */
  reference: StoredImage
  /** The template new dresses are generated with. */
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

export type JobStatus = "queued" | "processing" | "done" | "failed"

/** One AI edit of one product photo. Regenerating a photo adds a new job for it. */
export type Job = {
  id: string
  templateId: string
  /** Template state at the time the job was created, so later edits don't affect it. */
  templateSnapshot: TemplateSettings & {
    name: string
    slug: string
    reference: StoredImage
  }
  /** Original filename as uploaded. */
  originalName: string
  /** The uploaded product photo. */
  source: StoredImage
  /** The product photo this edit is for. */
  photoId?: string
  /** Requested output size, e.g. "1024x1536". */
  size?: string
  status: JobStatus
  error?: string
  attempts: number
  createdAt: string
  startedAt?: string
  finishedAt?: string
}

export const PHOTO_VIEWS = ["front", "back"] as const
export type PhotoView = (typeof PHOTO_VIEWS)[number]

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
  /** Stock per size, e.g. { S: 2, M: 3 }. Missing sizes are 0. */
  quantities: Record<string, number>
  /** The first colour has front + back; the others front only. */
  photos: ProductPhoto[]
}

/** generating: edits still running · attention: an edit failed · ready: every photo done. */
export type ProductStatus = "generating" | "attention" | "ready"

/** A dress, as one Shopify product: Color × Size variants with one price. */
export type Product = {
  id: string
  /** AI-generated (no colour in it), editable. Unset until the first edit names it. */
  name?: string
  /** Shopify URL handle and file name stem, e.g. "satin-wrap-midi-dress". */
  handle?: string
  /** In CURRENCY (lib/dress.ts), same for every colour and size. */
  price: number
  /** In display order, e.g. ["S", "M", "L", "XL", "XXL"]. */
  sizes: string[]
  note?: string
  templateId?: string
  exportedAt?: string
  createdAt: string
  updatedAt: string
  colors: ProductColor[]
  status: ProductStatus
}
