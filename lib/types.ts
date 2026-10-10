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
  createdAt: string
  updatedAt: string
}

export type JobStatus = "queued" | "processing" | "done" | "failed"

/** One product, named by the vision model. All runs of the same photo share it and its file. */
export type Dress = {
  id: string
  /** e.g. "Emerald Satin Wrap Midi Dress" */
  name: string
  /** Unique file name stem, e.g. "emerald-satin-wrap-midi-dress" (or "-2", "-3"…). */
  fileName: string
  /** The latest result on ImageKit, at "<folder>/<fileName>.<ext>". */
  image?: StoredImage
}

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
  /** Set once named. Regenerated jobs reuse it, so they replace the same ImageKit file. */
  dressId?: string
  /** From the dress, for display. */
  name?: string
  fileName?: string
  /** The dress's current image on ImageKit, set when done. */
  output?: StoredImage
  /** Requested output size, e.g. "1024x1536". */
  size?: string
  status: JobStatus
  error?: string
  attempts: number
  createdAt: string
  startedAt?: string
  finishedAt?: string
}
