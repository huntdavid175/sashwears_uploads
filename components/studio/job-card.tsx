"use client"

import {
  DownloadIcon,
  ExternalLinkIcon,
  PencilIcon,
  RefreshCwIcon,
  RotateCcwIcon,
} from "lucide-react"
import { useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { imageUrl } from "@/lib/client"
import type { Job } from "@/lib/types"

/** Card previews are ~15rem wide; 2x for sharp screens. */
const PREVIEW_WIDTH = 640

const STATUS_LABEL: Record<Job["status"], string> = {
  queued: "Waiting",
  processing: "Working",
  done: "Done",
  failed: "Failed",
}

export function JobCard({
  job,
  onRetry,
  onRegenerate,
  onRename,
}: {
  job: Job
  onRetry: (job: Job) => void
  onRegenerate: (job: Job) => void
  /** Resolves true once saved, so the editor can close. */
  onRename: (job: Job, name: string) => Promise<boolean>
}) {
  const aspect = job.size ? aspectOf(job.size) : `${job.source.width} / ${job.source.height}`
  const [renaming, setRenaming] = useState(false)

  return (
    <Card size="sm" className="gap-3">
      <CardHeader className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <RenameForm
              initial={job.name ?? ""}
              onCancel={() => setRenaming(false)}
              onSave={async (name) => {
                if (await onRename(job, name)) setRenaming(false)
              }}
            />
          ) : (
            <div className="flex min-w-0 items-center gap-1">
              <CardTitle
                className="truncate text-sm font-medium"
                title={job.name ?? job.originalName}
              >
                {job.name ?? job.originalName}
              </CardTitle>
              {job.name && job.status !== "processing" && (
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Rename"
                  title="Rename (also renames the file on ImageKit)"
                  onClick={() => setRenaming(true)}
                >
                  <PencilIcon />
                </Button>
              )}
            </div>
          )}
          {job.name && (
            <CardDescription className="truncate text-xs" title={job.originalName}>
              {job.originalName}
            </CardDescription>
          )}
        </div>
        <Badge
          variant={
            job.status === "failed"
              ? "destructive"
              : job.status === "done"
                ? "secondary"
                : "default"
          }
        >
          {job.status === "processing" && <Spinner data-icon="inline-start" />}
          {STATUS_LABEL[job.status]}
          {job.status === "processing" && job.startedAt && <Elapsed since={job.startedAt} />}
        </Badge>
      </CardHeader>

      <CardContent>
        {job.status === "done" && job.output ? (
          <Compare
            before={imageUrl(job.source, { width: PREVIEW_WIDTH })}
            after={imageUrl(job.output, { width: PREVIEW_WIDTH })}
            aspect={aspect}
          />
        ) : (
          <div
            className="relative overflow-hidden rounded-md bg-muted"
            style={{ aspectRatio: aspect }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- ImageKit resizes it */}
            <img
              src={imageUrl(job.source, { width: PREVIEW_WIDTH })}
              alt={`Original ${job.originalName}`}
              className="size-full object-contain opacity-60"
            />
          </div>
        )}
        {job.status === "failed" && job.error && (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {job.error}
          </p>
        )}
      </CardContent>

      {(job.status === "done" || job.status === "failed") && (
        <CardFooter className="flex-wrap gap-2">
          {job.status === "failed" ? (
            <Button size="sm" variant="outline" onClick={() => onRetry(job)}>
              <RotateCcwIcon data-icon="inline-start" />
              Retry
            </Button>
          ) : (
            job.output && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  nativeButton={false}
                  render={<a href={imageUrl(job.output, { download: true })} download />}
                >
                  <DownloadIcon data-icon="inline-start" />
                  Download
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  nativeButton={false}
                  render={<a href={job.output.url} target="_blank" rel="noreferrer" />}
                >
                  <ExternalLinkIcon data-icon="inline-start" />
                  ImageKit
                </Button>
                <Tooltip>
                  <TooltipTrigger
                    render={<Button size="sm" variant="ghost" onClick={() => onRegenerate(job)} />}
                  >
                    <RefreshCwIcon data-icon="inline-start" />
                    Regenerate
                  </TooltipTrigger>
                  <TooltipContent>
                    Run this photo again with the template&apos;s current settings. Replaces this
                    dress&apos;s image on ImageKit.
                  </TooltipContent>
                </Tooltip>
              </>
            )
          )}
        </CardFooter>
      )}
    </Card>
  )
}

function RenameForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: string
  onSave: (name: string) => Promise<void>
  onCancel: () => void
}) {
  const [value, setValue] = useState(initial)
  const [saving, setSaving] = useState(false)

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (!value.trim() || value.trim() === initial) return onCancel()
        setSaving(true)
        await onSave(value)
        setSaving(false)
      }}
    >
      <Input
        autoFocus
        value={value}
        maxLength={80}
        disabled={saving}
        aria-label="Dress name"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
        onBlur={(e) => !saving && e.currentTarget.form?.requestSubmit()}
        className="h-7 text-sm"
      />
    </form>
  )
}

/** Drag to compare the original photo with the result. */
function Compare({ before, after, aspect }: { before: string; after: string; aspect: string }) {
  const [split, setSplit] = useState(50)

  return (
    <div
      className="relative overflow-hidden rounded-md bg-muted select-none"
      style={{ aspectRatio: aspect }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- ImageKit resizes it */}
      <img src={after} alt="Result" className="absolute inset-0 size-full object-contain" />
      {/* eslint-disable-next-line @next/next/no-img-element -- ImageKit resizes it */}
      <img
        src={before}
        alt="Original"
        className="absolute inset-0 size-full bg-muted object-contain"
        style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-primary"
        style={{ left: `${split}%` }}
      >
        <span className="absolute top-1/2 left-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-card" />
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={split}
        onChange={(e) => setSplit(Number(e.target.value))}
        aria-label="Compare original and result"
        className="peer absolute inset-0 size-full cursor-ew-resize opacity-0"
      />
      <div className="pointer-events-none absolute inset-0 rounded-md ring-3 ring-ring/50 ring-inset opacity-0 peer-focus-visible:opacity-100" />
    </div>
  )
}

function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const s = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000))
  return (
    <span className="tabular-nums">{`${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`}</span>
  )
}

function aspectOf(size: string) {
  const [w, h] = size.split("x").map(Number)
  return w && h ? `${w} / ${h}` : "3 / 4"
}
