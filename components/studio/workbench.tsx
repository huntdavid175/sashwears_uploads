"use client"

import { CopyIcon, EllipsisIcon, PencilIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"

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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/components/ui/toast"
import { api, imageUrl, useJobs } from "@/lib/client"
import { MODEL_CAPS } from "@/lib/models"
import type { Job, Template } from "@/lib/types"

import type { DressInput } from "./dress-dialog"
import { JobCard } from "./job-card"
import { TemplateDialog } from "./template-dialog"
import { UploadTray } from "./upload-tray"

const QUALITY_LABEL = {
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max",
}

export function Workbench({
  template,
  onChanged,
  onDuplicated,
  onDeleted,
}: {
  template: Template
  onChanged: (t: Template) => void
  onDuplicated: (t: Template) => void
  onDeleted: () => void
}) {
  const { jobs, refresh } = useJobs(template.id)
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function duplicate() {
    try {
      const copy = await api<Template>(`/api/templates/${template.id}/duplicate`, {
        method: "POST",
      })
      toast.add({ type: "success", title: `Duplicated as "${copy.name}"` })
      onDuplicated(copy)
    } catch (err) {
      toast.add({ type: "error", title: "Couldn't duplicate", description: (err as Error).message })
    }
  }

  async function remove() {
    try {
      await api(`/api/templates/${template.id}`, { method: "DELETE" })
      toast.add({ type: "success", title: `Deleted "${template.name}"` })
      onDeleted()
    } catch (err) {
      toast.add({ type: "error", title: "Couldn't delete", description: (err as Error).message })
    }
  }

  async function jobAction(job: Job, action: "retry" | "regenerate") {
    try {
      await api(`/api/jobs/${job.id}/${action}`, { method: "POST" })
      void refresh()
    } catch (err) {
      toast.add({
        type: "error",
        title: action === "retry" ? "Couldn't retry" : "Couldn't regenerate",
        description: (err as Error).message,
      })
    }
  }

  async function saveDress(job: Job, input: DressInput) {
    try {
      await api(`/api/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      void refresh()
      return true
    } catch (err) {
      toast.add({ type: "error", title: "Couldn't save", description: (err as Error).message })
      return false
    }
  }

  const active = jobs?.filter((j) => j.status === "queued" || j.status === "processing").length ?? 0

  return (
    <div className="flex flex-col gap-8">
      <header className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
        <div className="w-36 overflow-hidden rounded-lg bg-card ring-1 ring-border md:w-auto">
          {/* eslint-disable-next-line @next/next/no-img-element -- local API image */}
          <img
            src={imageUrl(template.reference, { width: 480 })}
            alt={`Background reference for ${template.name}`}
            className="aspect-[3/4] w-full object-cover"
          />
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <h1 className="font-condensed text-4xl leading-none font-semibold tracking-tight text-balance md:text-5xl">
              {template.name}
            </h1>
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" onClick={() => setEditing(true)}>
                <PencilIcon data-icon="inline-start" />
                Edit
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button variant="outline" size="icon" aria-label="More actions" />}
                >
                  <EllipsisIcon />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={duplicate}>
                      <CopyIcon />
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
                      <Trash2Icon />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{MODEL_CAPS[template.model].label}</Badge>
            <Badge variant="outline">{QUALITY_LABEL[template.quality]} quality</Badge>
            <Badge variant="outline">{template.outputFormat.toUpperCase()}</Badge>
          </div>

          <p className="max-w-prose text-pretty text-muted-foreground">{template.prompt}</p>

          <UploadTray template={template} onQueued={refresh} />
        </div>
      </header>

      <section aria-labelledby="results-heading" className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="results-heading" className="text-lg font-semibold">
            Results
          </h2>
          {active > 0 && (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {active} in progress. Results are saved to data/outputs/{template.slug}.
            </p>
          )}
        </div>

        {jobs === null ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(15rem,100%),1fr))] gap-4">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="aspect-[3/4]" />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <Empty className="border border-dashed border-border">
            <EmptyHeader>
              <EmptyTitle>No results yet</EmptyTitle>
              <EmptyDescription>
                Add product photos above. Each result is named after the dress and saved to
                ImageKit.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(15rem,100%),1fr))] items-start gap-4">
            {jobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                onRetry={(j) => jobAction(j, "retry")}
                onRegenerate={(j) => jobAction(j, "regenerate")}
                onSaveDress={saveDress}
              />
            ))}
          </div>
        )}
      </section>

      <TemplateDialog
        open={editing}
        onOpenChange={setEditing}
        template={template}
        onSaved={onChanged}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{template.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              The template and its reference photo are removed. Results you&apos;ve already made
              stay in data/outputs.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>
              Delete template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
