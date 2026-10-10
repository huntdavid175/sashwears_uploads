"use client"

import { DownloadIcon, ImageIcon, ImagePlusIcon, Trash2Icon, XIcon } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { api, imageUrl, uploadToImageKit, useUploads } from "@/lib/client"
import type { Upload } from "@/lib/types"
import { cn } from "@/lib/utils"

const MAX_FILES = 100
/** Files uploaded at once; enough to be quick without flooding a phone connection. */
const PARALLEL = 3

export function Inbox() {
  const { uploads, error, refresh, update } = useUploads()
  const [downloading, setDownloading] = useState(false)
  const [deleting, setDeleting] = useState<Upload | null>(null)

  const batches = groupByBatch(uploads ?? [])
  const fresh = (uploads ?? []).filter((u) => !u.downloadedAt)

  async function download(list: Upload[]) {
    if (!list.length) return
    setDownloading(true)
    try {
      // One file at a time, spaced out: browsers drop rapid back-to-back downloads.
      for (const [i, u] of list.entries()) {
        if (i) await new Promise((r) => setTimeout(r, 600))
        const a = document.createElement("a")
        a.href = imageUrl(u.image, { download: true })
        a.download = u.originalName
        a.rel = "noopener"
        document.body.append(a)
        a.click()
        a.remove()
      }
      const ids = list.filter((u) => !u.downloadedAt).map((u) => u.id)
      if (ids.length) {
        const now = new Date().toISOString()
        update((all) => all.map((u) => (ids.includes(u.id) ? { ...u, downloadedAt: now } : u)))
        await api("/api/uploads/downloaded", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        })
      }
    } catch (err) {
      toast.add({ type: "error", title: "Download failed", description: (err as Error).message })
    } finally {
      setDownloading(false)
    }
  }

  async function remove(u: Upload) {
    try {
      await api(`/api/uploads/${u.id}`, { method: "DELETE" })
      update((all) => all.filter((x) => x.id !== u.id))
    } catch (err) {
      toast.add({ type: "error", title: "Couldn't delete", description: (err as Error).message })
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 p-4 md:p-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Uploads</h1>
        <p className="text-muted-foreground">
          Send product photos here. They&apos;re kept in full quality, ready to download.
        </p>
      </header>

      <UploadForm onUploaded={refresh} />

      <section aria-labelledby="received" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="received" className="text-lg font-semibold tracking-tight">
            Received
            {uploads && uploads.length > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {uploads.length} photo{uploads.length === 1 ? "" : "s"}
              </span>
            )}
          </h2>
          {fresh.length > 0 && (
            <Button onClick={() => download(fresh)} disabled={downloading}>
              {downloading ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <DownloadIcon data-icon="inline-start" />
              )}
              Download new ({fresh.length})
            </Button>
          )}
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Couldn&apos;t load uploads</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : uploads === null ? (
          <Skeleton className="h-64" />
        ) : batches.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyTitle>Nothing uploaded yet</EmptyTitle>
              <EmptyDescription>Photos you upload above will appear here.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          batches.map((batch) => (
            <Card key={batch.id} size="sm">
              <CardHeader>
                <CardTitle>{formatDate(batch.createdAt)}</CardTitle>
                <CardDescription>
                  {batch.items.length} photo{batch.items.length === 1 ? "" : "s"}
                  {batch.note && <span className="block text-foreground">{batch.note}</span>}
                </CardDescription>
                <CardAction>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={downloading}
                    onClick={() => download(batch.items)}
                  >
                    <DownloadIcon data-icon="inline-start" />
                    Download all
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(9rem,100%),1fr))] gap-3">
                  {batch.items.map((u) => (
                    <li key={u.id} className="flex flex-col gap-1.5">
                      <div className="relative">
                        <Thumb
                          src={imageUrl(u.image, { width: 400 })}
                          alt={u.originalName}
                          className="aspect-square"
                        />
                        {!u.downloadedAt && (
                          <Badge className="absolute top-1.5 left-1.5">New</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="min-w-0 flex-1 truncate text-xs" title={u.originalName}>
                          {u.originalName}
                        </span>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                size="icon-xs"
                                variant="ghost"
                                aria-label={`Download ${u.originalName}`}
                                disabled={downloading}
                                onClick={() => download([u])}
                              />
                            }
                          >
                            <DownloadIcon />
                          </TooltipTrigger>
                          <TooltipContent>Download</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                size="icon-xs"
                                variant="ghost"
                                aria-label={`Delete ${u.originalName}`}
                                onClick={() => setDeleting(u)}
                              />
                            }
                          >
                            <Trash2Icon />
                          </TooltipTrigger>
                          <TooltipContent>Delete</TooltipContent>
                        </Tooltip>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))
        )}
      </section>

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this photo?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.originalName} will be removed for everyone. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleting) void remove(deleting)
                setDeleting(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}

type Staged = { key: string; file: File; url: string }

function UploadForm({ onUploaded }: { onUploaded: () => void }) {
  const id = useId()
  const [staged, setStaged] = useState<Staged[]>([])
  const [note, setNote] = useState("")
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  // Free preview URLs on unmount (removal/clear free their own).
  const latest = useRef(staged)
  useEffect(() => {
    latest.current = staged
  }, [staged])
  useEffect(() => () => latest.current.forEach((s) => URL.revokeObjectURL(s.url)), [])

  function add(files: FileList | File[]) {
    const list = Array.from(files)
    const images = list.filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name))
    const room = MAX_FILES - staged.length
    if (images.length < list.length) {
      toast.add({
        type: "warning",
        title: `Skipped ${list.length - images.length} non-image file(s)`,
      })
    }
    if (images.length > room) {
      toast.add({ type: "warning", title: `Up to ${MAX_FILES} photos at a time` })
    }
    const next = images
      .slice(0, room)
      .map((file) => ({ key: crypto.randomUUID(), file, url: URL.createObjectURL(file) }))
    setStaged((s) => [...s, ...next])
  }

  function remove(key: string) {
    setStaged((s) => {
      const gone = s.find((x) => x.key === key)
      if (gone) URL.revokeObjectURL(gone.url)
      return s.filter((x) => x.key !== key)
    })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!staged.length) return
    setProgress({ done: 0, total: staged.length })
    const uploaded: { fileId: string; originalName: string }[] = []
    const failed: Staged[] = []
    let done = 0
    const queue = [...staged]
    await Promise.all(
      Array.from({ length: PARALLEL }, async () => {
        for (let s = queue.shift(); s; s = queue.shift()) {
          try {
            uploaded.push({
              fileId: await uploadToImageKit(s.file, "inbox"),
              originalName: s.file.name,
            })
          } catch {
            failed.push(s)
          }
          setProgress({ done: ++done, total: staged.length })
        }
      }),
    )

    try {
      if (uploaded.length) {
        await api("/api/uploads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note, files: uploaded }),
        })
      }
      // Keep only the ones that failed, so they can be tried again.
      staged.filter((s) => !failed.includes(s)).forEach((s) => URL.revokeObjectURL(s.url))
      setStaged(failed)
      if (!failed.length) setNote("")
      if (failed.length) {
        toast.add({
          type: "error",
          title: `${failed.length} photo${failed.length === 1 ? "" : "s"} didn't upload`,
          description: "They're still selected — press Upload to try again.",
        })
      } else {
        toast.add({
          type: "success",
          title: `Uploaded ${uploaded.length} photo${uploaded.length === 1 ? "" : "s"}`,
        })
      }
      onUploaded()
    } catch (err) {
      toast.add({ type: "error", title: "Upload failed", description: (err as Error).message })
    } finally {
      setProgress(null)
    }
  }

  const busy = progress !== null

  return (
    <Card>
      <form onSubmit={submit} className="contents">
        <CardHeader>
          <CardTitle>Upload photos</CardTitle>
          <CardDescription>
            Any photo format, up to 50MB each, {MAX_FILES} at a time.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
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
              if (!busy) add(e.dataTransfer.files)
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/50 px-4 py-10 text-center text-sm text-muted-foreground hover:border-primary has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
              dragging && "border-primary bg-muted",
            )}
          >
            <ImagePlusIcon className="size-6" />
            <span>
              <span className="font-medium text-foreground">Choose photos</span> or drop them here
            </span>
            <input
              id={`${id}-files`}
              type="file"
              accept="image/*,.heic,.heif"
              multiple
              disabled={busy}
              className="sr-only"
              onChange={(e) => {
                if (e.target.files) add(e.target.files)
                e.target.value = ""
              }}
            />
          </label>

          {staged.length > 0 && (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2">
              {staged.map((s) => (
                <li key={s.key} className="relative">
                  <Thumb src={s.url} alt={s.file.name} className="aspect-square" />
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="secondary"
                    aria-label={`Remove ${s.file.name}`}
                    disabled={busy}
                    onClick={() => remove(s.key)}
                    className="absolute top-1 right-1"
                  >
                    <XIcon />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <Field>
            <FieldLabel htmlFor={`${id}-note`}>Note (optional)</FieldLabel>
            <Textarea
              id={`${id}-note`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. New arrivals for the weekend — please do the white background"
              maxLength={500}
              rows={2}
            />
            <FieldDescription>Shown with this batch of photos.</FieldDescription>
          </Field>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={!staged.length || busy}>
            {busy && <Spinner data-icon="inline-start" />}
            {busy
              ? `Uploading ${progress.done} of ${progress.total}…`
              : staged.length
                ? `Upload ${staged.length} photo${staged.length === 1 ? "" : "s"}`
                : "Upload photos"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

/** Image with a placeholder when the browser can't show it (e.g. HEIC previews). */
function Thumb({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [broken, setBroken] = useState(false)
  return (
    <div className={cn("overflow-hidden rounded-md bg-muted", className)}>
      {broken ? (
        <div className="flex size-full items-center justify-center text-muted-foreground">
          <ImageIcon aria-label={alt} />
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- ImageKit/blob URL, already sized
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onError={() => setBroken(true)}
          className="size-full object-cover"
        />
      )}
    </div>
  )
}

function groupByBatch(uploads: Upload[]) {
  const map = new Map<string, { id: string; note?: string; createdAt: string; items: Upload[] }>()
  for (const u of uploads) {
    const batch = map.get(u.batchId)
    if (batch) batch.items.push(u)
    else map.set(u.batchId, { id: u.batchId, note: u.note, createdAt: u.createdAt, items: [u] })
  }
  return [...map.values()]
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(iso),
  )
}
