"use client"

import { ImagePlusIcon, XIcon } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { api, readDimensions, uploadToImageKit } from "@/lib/client"
import { estimateCost } from "@/lib/models"
import { pickSize } from "@/lib/size"
import { cn } from "@/lib/utils"
import type { Job, Template } from "@/lib/types"

const MAX_BATCH = 20
const ACCEPT = ["image/png", "image/jpeg", "image/webp"]

type Staged = { key: string; file: File; url: string; width?: number; height?: number }

export function UploadTray({ template, onQueued }: { template: Template; onQueued: () => void }) {
  const id = useId()
  const [staged, setStaged] = useState<Staged[]>([])
  const [dragging, setDragging] = useState(false)
  const [sending, setSending] = useState(false)

  // Free preview URLs on unmount (removal/clear free their own).
  const latest = useRef(staged)
  useEffect(() => {
    latest.current = staged
  }, [staged])
  useEffect(() => () => latest.current.forEach((s) => URL.revokeObjectURL(s.url)), [])

  function clear() {
    staged.forEach((s) => URL.revokeObjectURL(s.url))
    setStaged([])
  }

  async function add(files: FileList | File[]) {
    const list = Array.from(files)
    const rejected = list.filter((f) => !ACCEPT.includes(f.type))
    const accepted = list.filter((f) => ACCEPT.includes(f.type)).slice(0, MAX_BATCH - staged.length)
    if (rejected.length) {
      toast.add({
        type: "warning",
        title: `Skipped ${rejected.length} file(s)`,
        description: "Only PNG, JPEG and WebP photos work.",
      })
    }
    if (list.length - rejected.length > accepted.length) {
      toast.add({
        type: "warning",
        title: `Up to ${MAX_BATCH} photos per batch`,
        description: "Start this batch, then add the rest.",
      })
    }
    const next = await Promise.all(
      accepted.map(async (file) => {
        const dims = await readDimensions(file).catch(() => ({}))
        return { key: crypto.randomUUID(), file, url: URL.createObjectURL(file), ...dims }
      }),
    )
    setStaged((s) => [...s, ...next])
  }

  function remove(key: string) {
    setStaged((s) => {
      const gone = s.find((x) => x.key === key)
      if (gone) URL.revokeObjectURL(gone.url)
      return s.filter((x) => x.key !== key)
    })
  }

  async function start() {
    setSending(true)
    try {
      // Photos go straight to ImageKit (Vercel caps request bodies at ~4.5MB), 4 at a time.
      const sources: { fileId: string; originalName: string }[] = []
      for (let i = 0; i < staged.length; i += 4) {
        const batch = staged.slice(i, i + 4)
        const ids = await Promise.all(batch.map((s) => uploadToImageKit(s.file, "sources")))
        ids.forEach((fileId, j) => sources.push({ fileId, originalName: batch[j].file.name }))
      }
      const jobs = await api<Job[]>(`/api/templates/${template.id}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sources }),
      })
      toast.add({
        type: "success",
        title: `Started ${jobs.length} photo${jobs.length === 1 ? "" : "s"}`,
      })
      clear()
      onQueued()
    } catch (err) {
      toast.add({
        type: "error",
        title: "Couldn't start the batch",
        description: (err as Error).message,
      })
    } finally {
      setSending(false)
    }
  }

  const estimate = staged.reduce(
    (sum, s) =>
      sum +
      estimateCost(
        template.model,
        template.quality,
        pickSize(template.model, s.width ?? 1024, s.height ?? 1024),
      ),
    0,
  )

  return (
    <section aria-label="Add product photos" className="flex flex-col gap-3">
      <label
        htmlFor={`${id}-files`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          void add(e.dataTransfer.files)
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-card/60 px-6 py-8 text-center text-sm text-muted-foreground transition-colors hover:border-primary has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
          dragging && "border-primary bg-card",
        )}
      >
        <ImagePlusIcon className="size-6" />
        <span>
          <span className="font-medium text-foreground">Drop product photos here</span> or click to
          choose
        </span>
        <span>Up to {MAX_BATCH} at a time. Each one gets this template&apos;s background.</span>
        <input
          id={`${id}-files`}
          type="file"
          multiple
          accept={ACCEPT.join(",")}
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) void add(e.target.files)
            e.target.value = ""
          }}
        />
      </label>

      {staged.length > 0 && (
        <div className="flex flex-col gap-3 rounded-lg bg-card p-3 ring-1 ring-border">
          <ul className="flex gap-2 overflow-x-auto pb-1">
            {staged.map((s) => (
              <li key={s.key} className="relative shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
                <img
                  src={s.url}
                  alt={s.file.name}
                  className="h-20 w-auto rounded-md bg-muted object-cover"
                />
                <Button
                  size="icon-xs"
                  variant="secondary"
                  className="absolute top-1 right-1"
                  aria-label={`Remove ${s.file.name}`}
                  onClick={() => remove(s.key)}
                >
                  <XIcon />
                </Button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {staged.length} photo{staged.length === 1 ? "" : "s"}, about{" "}
              <span className="font-medium text-foreground tabular-nums">
                ${estimate.toFixed(2)}
              </span>{" "}
              estimated
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={clear} disabled={sending}>
                Clear
              </Button>
              <Button onClick={start} disabled={sending}>
                {sending && <Spinner data-icon="inline-start" />}
                Start {staged.length} photo{staged.length === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
