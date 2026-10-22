"use client"

import { ImagePlusIcon, XIcon } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { PHOTO_ACCEPT } from "@/components/products/fields"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"
import { uploadToImageKit } from "@/lib/client"
import { cn } from "@/lib/utils"

export type Picked = { key: string; file: File; url: string }

/** Photos uploaded to ImageKit at once. */
const PARALLEL = 3

// React list keys only (not used in ids), so a counter is enough and stays prerender-safe.
let keys = 0
export const nextKey = () => `k${++keys}`

/**
 * Photos chosen in the browser, with previews, and their upload to ImageKit. Already-uploaded
 * ones are remembered, so sorting again after going back doesn't upload twice.
 */
export function usePickedPhotos(max: number) {
  const [picked, setPicked] = useState<Picked[]>([])
  const uploaded = useRef(new Map<string, string>())

  // Free preview URLs on unmount (removal frees its own).
  const latest = useRef(picked)
  useEffect(() => {
    latest.current = picked
  }, [picked])
  useEffect(() => () => latest.current.forEach((p) => URL.revokeObjectURL(p.url)), [])

  const add = useCallback(
    (files: FileList | File[]) => {
      const accepted = PHOTO_ACCEPT.split(",")
      const list = Array.from(files)
      const images = list.filter((f) => accepted.includes(f.type))
      if (images.length < list.length) {
        toast.add({
          type: "warning",
          title: `Skipped ${list.length - images.length} file(s)`,
          description: "Only PNG, JPEG and WebP photos work.",
        })
      }
      const room = max - latest.current.length
      if (images.length > room) toast.add({ type: "warning", title: `Up to ${max} photos` })
      const next = images
        .slice(0, Math.max(0, room))
        .map((file) => ({ key: nextKey(), file, url: URL.createObjectURL(file) }))
      setPicked((p) => [...p, ...next])
    },
    [max],
  )

  const remove = useCallback((key: string) => {
    setPicked((list) => {
      const gone = list.find((p) => p.key === key)
      if (gone) URL.revokeObjectURL(gone.url)
      return list.filter((p) => p.key !== key)
    })
  }, [])

  /** Upload what isn't on ImageKit yet; returns every photo's fileId and file name, in order. */
  async function uploadAll(onProgress: (done: number, total: number) => void) {
    const list = latest.current
    const todo = list.filter((p) => !uploaded.current.has(p.key))
    let done = list.length - todo.length
    onProgress(done, list.length)
    const queue = [...todo]
    await Promise.all(
      Array.from({ length: PARALLEL }, async () => {
        for (let p = queue.shift(); p; p = queue.shift()) {
          uploaded.current.set(p.key, await uploadToImageKit(p.file, "sources"))
          onProgress(++done, list.length)
        }
      }),
    )
    return list.map((p) => ({ fileId: uploaded.current.get(p.key)!, originalName: p.file.name }))
  }

  return { picked, add, remove, uploadAll }
}

/** Drop or choose any number of photos; shows what's picked. */
export function PhotoDrop({
  id,
  picked,
  onAdd,
  onRemove,
  disabled,
  invalid,
}: {
  id: string
  picked: Picked[]
  onAdd: (files: FileList | File[]) => void
  onRemove: (key: string) => void
  disabled?: boolean
  invalid?: boolean
}) {
  const [dragging, setDragging] = useState(false)

  return (
    <div className="flex flex-col gap-3">
      <label
        htmlFor={id}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          if (!disabled) onAdd(e.dataTransfer.files)
        }}
        aria-invalid={invalid || undefined}
        className={cn(
          "flex cursor-pointer items-center justify-center gap-3 rounded-sm border border-dashed border-input bg-muted px-4 py-8 text-sm text-muted-foreground hover:border-primary hover:text-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/50 aria-invalid:border-destructive",
          dragging && "border-primary bg-primary/5 text-foreground",
        )}
      >
        <ImagePlusIcon className="size-5 shrink-0" />
        <span>
          <span className="font-semibold text-primary">Choose photos</span> or drop them here. Any
          number, PNG, JPEG or WebP.
        </span>
        <input
          id={id}
          type="file"
          accept={PHOTO_ACCEPT}
          multiple
          disabled={disabled}
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) onAdd(e.target.files)
            e.target.value = ""
          }}
        />
      </label>
      {picked.length > 0 && (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-1.5">
          {picked.map((p) => (
            <li key={p.key} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
              <img
                src={p.url}
                alt={p.file.name}
                className="aspect-[3/4] w-full rounded-sm bg-muted object-cover"
              />
              <Button
                type="button"
                size="icon-xs"
                variant="secondary"
                aria-label={`Remove ${p.file.name}`}
                disabled={disabled}
                onClick={() => onRemove(p.key)}
                className="absolute top-1 right-1"
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
