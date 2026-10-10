"use client"

import {
  DownloadIcon,
  ExternalLinkIcon,
  PencilIcon,
  PlusIcon,
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
import { Spinner } from "@/components/ui/spinner"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { imageUrl } from "@/lib/client"
import { formatPrice } from "@/lib/dress"
import type { Job } from "@/lib/types"

import { DressDialog, type DressInput } from "./dress-dialog"

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
  onSaveDress,
}: {
  job: Job
  onRetry: (job: Job) => void
  onRegenerate: (job: Job) => void
  /** Resolves true once saved, so the dialog can close. */
  onSaveDress: (job: Job, input: DressInput) => Promise<boolean>
}) {
  const aspect = job.size ? aspectOf(job.size) : `${job.source.width} / ${job.source.height}`
  const [editing, setEditing] = useState(false)
  const editable = Boolean(job.dressId) && job.status !== "processing"

  return (
    <Card size="sm" className="gap-3">
      <CardHeader className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1">
            <CardTitle
              className="truncate text-sm font-medium"
              title={job.name ?? job.originalName}
            >
              {job.name ?? job.originalName}
            </CardTitle>
            {editable && (
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Edit dress details"
                title="Edit name, colors and price"
                onClick={() => setEditing(true)}
              >
                <PencilIcon />
              </Button>
            )}
          </div>
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
        {job.status === "done" && job.dressId && (
          <DressDetails job={job} onEdit={() => setEditing(true)} />
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

      {job.dressId && (
        <DressDialog job={job} open={editing} onOpenChange={setEditing} onSave={onSaveDress} />
      )}
    </Card>
  )
}

/** Colors and price under the result, or a prompt to add them. */
function DressDetails({ job, onEdit }: { job: Job; onEdit: () => void }) {
  const empty = job.colors.length === 0 && job.price === undefined
  if (empty) {
    return (
      <Button size="sm" variant="ghost" className="mt-2 -ml-2" onClick={onEdit}>
        <PlusIcon data-icon="inline-start" />
        Add colors &amp; price
      </Button>
    )
  }
  return (
    <button
      type="button"
      onClick={onEdit}
      aria-label="Edit colors and price"
      className="mt-3 flex w-full items-start justify-between gap-3 rounded-md text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span className="flex min-w-0 flex-wrap gap-1">
        {job.colors.length ? (
          job.colors.map((c) => (
            <Badge key={c} variant="outline">
              {c}
            </Badge>
          ))
        ) : (
          <span className="text-sm text-muted-foreground">No colors yet</span>
        )}
      </span>
      <span className="shrink-0 text-sm font-medium tabular-nums">
        {job.price === undefined ? (
          <span className="font-normal text-muted-foreground">No price</span>
        ) : (
          formatPrice(job.price)
        )}
      </span>
    </button>
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
