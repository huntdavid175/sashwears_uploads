"use client"

import { useCallback, useEffect, useState } from "react"

import type { Job, StoredImage, Template } from "@/lib/types"

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
  const [templates, setTemplates] = useState<Template[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    api<Template[]>("/api/templates").then(
      (list) => alive && setTemplates(list),
      (err: Error) => alive && setError(err.message),
    )
    return () => {
      alive = false
    }
  }, [])

  /** Insert or replace a template locally after the server confirmed the change. */
  const upsert = useCallback((t: Template) => {
    setTemplates((list) => [t, ...(list ?? []).filter((x) => x.id !== t.id)])
  }, [])

  const removeLocal = useCallback((id: string) => {
    setTemplates((list) => (list ?? []).filter((x) => x.id !== id))
  }, [])

  return { templates, error, upsert, removeLocal }
}

const POLL_MS = 2000

/** Jobs for one template. Polls every 2s while anything is queued or processing. */
export function useJobs(templateId: string) {
  const [jobs, setJobs] = useState<Job[] | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      try {
        const next = await api<Job[]>(`/api/jobs?templateId=${encodeURIComponent(templateId)}`)
        if (!alive) return
        setJobs(next)
        if (next.some((j) => j.status === "queued" || j.status === "processing")) {
          timer = setTimeout(load, POLL_MS)
        }
      } catch {
        // Server briefly unavailable (e.g. dev restart): keep trying.
        if (alive) timer = setTimeout(load, POLL_MS * 2)
      }
    }
    void load()
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [templateId, version])

  /** Reload now (and resume polling if work is pending). */
  const refresh = useCallback(() => setVersion((v) => v + 1), [])

  return { jobs, refresh }
}

/** Read width/height in the browser so we can show size and cost before uploading. */
export async function readDimensions(file: File) {
  const bitmap = await createImageBitmap(file)
  const dims = { width: bitmap.width, height: bitmap.height }
  bitmap.close()
  return dims
}
