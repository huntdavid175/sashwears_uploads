"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import type { PhotoView, Product, Shoot, Shot, StoredImage, Template } from "@/lib/types"

/** fetch + JSON, throwing the server's `{ error }` message on failure. */
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (res.status === 204) return undefined as T
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`)
  return body as T
}

/**
 * ImageKit URL for display or download. `width` asks ImageKit for a resized copy (previews
 * stay light); `updatedAt` busts the browser cache after a file was overwritten in place.
 */
export function imageUrl(image: StoredImage, opts: { width?: number; download?: boolean } = {}) {
  const url = new URL(image.url)
  if (opts.width) url.searchParams.set("tr", `w-${opts.width}`)
  if (opts.download) url.searchParams.set("ik-attachment", "true")
  url.searchParams.set("v", String(Date.parse(image.updatedAt) || 0))
  return url.toString()
}

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024 // OpenAI's per-image limit

type UploadAuth = {
  token: string
  expire: number
  signature: string
  publicKey: string
  folder: string
}

/** Upload one file straight from the browser to ImageKit. Returns its fileId. */
export async function uploadToImageKit(file: File, kind: "sources" | "references") {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`${file.name} is larger than 50MB`)
  const auth = await api<UploadAuth>(`/api/imagekit/auth?kind=${kind}`)
  const form = new FormData()
  form.set("file", file)
  form.set("fileName", file.name)
  form.set("folder", auth.folder)
  form.set("useUniqueFileName", "true")
  form.set("publicKey", auth.publicKey)
  form.set("signature", auth.signature)
  form.set("expire", String(auth.expire))
  form.set("token", auth.token)
  const res = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
    method: "POST",
    body: form,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.fileId) {
    throw new Error(`Upload of ${file.name} failed: ${body.message ?? `HTTP ${res.status}`}`)
  }
  return body.fileId as string
}

export function useTemplates() {
  const { data, error, refresh } = usePolled<Template[]>("/api/templates", () => false)
  return { templates: data, error, refresh }
}

const POLL_MS = 3000

/**
 * Poll `url` every few seconds while `busy(data)` says work is running; otherwise load once
 * (and again when the tab regains focus). `refresh()` reloads now.
 */
function usePolled<T>(url: string, busy: (data: T) => boolean) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const busyRef = useRef(busy)
  useEffect(() => {
    busyRef.current = busy
  })

  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      try {
        const next = await api<T>(url)
        if (!alive) return
        setData(next)
        setError(null)
        if (busyRef.current(next)) timer = setTimeout(load, POLL_MS)
      } catch (err) {
        if (!alive) return
        setError((err as Error).message)
        // Server briefly unavailable (e.g. a deploy): keep trying.
        timer = setTimeout(load, POLL_MS * 3)
      }
    }
    void load()
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [url, version])

  useEffect(() => {
    const onFocus = () => setVersion((v) => v + 1)
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [])

  const refresh = useCallback(() => setVersion((v) => v + 1), [])
  return { data, error, refresh, setData }
}

const generating = (p: Product) => p.status === "generating"

export function useProducts() {
  const { data, error, refresh } = usePolled<Product[]>("/api/products", (list) =>
    list.some(generating),
  )
  return { products: data, error, refresh }
}

export function useShoot(id: string) {
  const { data, error, refresh, setData } = usePolled<Shoot>(
    `/api/shoots/${encodeURIComponent(id)}`,
    (s) => s.status === "generating",
  )
  return { shoot: data, error, refresh, setShoot: setData }
}

export type SortedPhoto = {
  fileId: string
  originalName: string
  image: StoredImage
  view: PhotoView
}

export type Classified = {
  name: string
  productType: string
  description: string
  /** The shots the photos were sorted into (the template's, or the default ones). */
  shots: Shot[]
  warning?: string
  photos: (SortedPhoto & { color: string })[]
}

/**
 * Ask the AI how uploaded photos group into colours and shots: the template's shots when
 * `templateId` is given; `describe` also asks for a shop description.
 */
export function classifyPhotos(
  files: { fileId: string; originalName: string }[],
  opts: { templateId?: string; describe?: boolean } = {},
) {
  return api<Classified>("/api/products/classify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files, templateId: opts.templateId, describe: opts.describe }),
  })
}

export function useProduct(id: string) {
  const { data, error, refresh, setData } = usePolled<Product>(
    `/api/products/${encodeURIComponent(id)}`,
    generating,
  )
  return { product: data, error, refresh, setProduct: setData }
}

/** Download the Shopify CSV for these dresses (the server marks them exported). */
export async function exportToShopify(ids: string[]) {
  const res = await fetch("/api/products/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Export failed (${res.status})`)
  }
  const name =
    /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ??
    "shopify-products.csv"
  saveBlob(await res.blob(), name)
}

/** Hand the browser a file to save. */
function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/**
 * Save a shoot as "<handle>.zip": one "<handle>/" folder with every finished image (original
 * bytes, straight from ImageKit) and description.txt. Zipped in the browser: Vercel caps
 * function responses at ~4.5MB.
 */
export async function downloadShootZip(
  shoot: Shoot,
  onProgress?: (done: number, total: number) => void,
) {
  const { strToU8, zipSync } = await import("fflate")
  const outputs = shoot.colors.flatMap((c) => c.images.flatMap((i) => (i.output ? [i.output] : [])))
  const files: Record<string, Uint8Array> = {}
  let done = 0
  onProgress?.(0, outputs.length)
  await Promise.all(
    outputs.map(async (output) => {
      const name = output.filePath.slice(output.filePath.lastIndexOf("/") + 1)
      const url = new URL(output.url)
      url.search = ""
      url.searchParams.set("tr", "orig-true")
      url.searchParams.set("v", String(Date.parse(output.updatedAt) || 0))
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Couldn't download ${name} (HTTP ${res.status})`)
      files[`${shoot.handle}/${name}`] = new Uint8Array(await res.arrayBuffer())
      onProgress?.(++done, outputs.length)
    }),
  )
  const text = [
    shoot.name,
    "",
    shoot.description,
    "",
    `Colours: ${shoot.colors.map((c) => c.name).join(", ")}`,
    "",
  ].join("\n")
  files[`${shoot.handle}/description.txt`] = strToU8(text)
  // Images are already compressed: store them as they are.
  saveBlob(
    new Blob([zipSync(files, { level: 0 })], { type: "application/zip" }),
    `${shoot.handle}.zip`,
  )
}

/** Read width/height in the browser so we can show size and cost before uploading. */
export async function readDimensions(file: File) {
  const bitmap = await createImageBitmap(file)
  const dims = { width: bitmap.width, height: bitmap.height }
  bitmap.close()
  return dims
}
