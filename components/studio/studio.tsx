"use client"

import { PlusIcon } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { imageUrl, useTemplates } from "@/lib/client"
import type { Template } from "@/lib/types"
import { cn } from "@/lib/utils"

import { TemplateDialog } from "./template-dialog"
import { Workbench } from "./workbench"

export function Studio() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const { templates, error, upsert, removeLocal } = useTemplates()
  const [creating, setCreating] = useState(false)

  const selectedId = params.get("t")
  const selected = templates?.find((t) => t.id === selectedId) ?? templates?.[0]

  function select(id: string | null) {
    router.replace(id ? `${pathname}?t=${id}` : pathname, { scroll: false })
  }

  function showTemplate(t: Template) {
    upsert(t)
    select(t.id)
  }

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col gap-4 border-b border-border p-4 md:sticky md:top-0 md:h-dvh md:w-64 md:border-r md:border-b-0">
        <p className="font-condensed text-xl font-semibold tracking-tight">Backdrop Studio</p>

        <Button onClick={() => setCreating(true)}>
          <PlusIcon data-icon="inline-start" />
          New template
        </Button>

        <nav
          aria-label="Templates"
          className="-mx-1 flex gap-2 overflow-x-auto px-1 md:flex-col md:overflow-y-auto"
        >
          {templates === null && !error
            ? Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-16 w-48 md:w-full" />
              ))
            : templates?.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => select(t.id)}
                  aria-current={t.id === selected?.id ? "page" : undefined}
                  className={cn(
                    "flex shrink-0 items-center gap-3 rounded-lg p-1.5 pr-3 text-left outline-none hover:bg-card/60 focus-visible:ring-3 focus-visible:ring-ring/50 md:shrink",
                    t.id === selected?.id && "bg-card ring-1 ring-border hover:bg-card",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- local API image */}
                  <img
                    src={imageUrl(t.reference, { width: 160 })}
                    alt=""
                    className="size-12 shrink-0 rounded-md bg-muted object-cover"
                  />
                  <span className="font-condensed max-w-40 truncate text-base font-medium">
                    {t.name}
                  </span>
                </button>
              ))}
        </nav>
      </aside>

      <main className="min-w-0 flex-1 p-4 md:p-8">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Couldn&apos;t load templates</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : templates === null ? (
          <Skeleton className="h-96" />
        ) : selected ? (
          <Workbench
            key={selected.id}
            template={selected}
            onChanged={showTemplate}
            onDuplicated={showTemplate}
            onDeleted={() => {
              removeLocal(selected.id)
              select(null)
            }}
          />
        ) : (
          <Empty className="h-full">
            <EmptyHeader>
              <EmptyTitle>Create your first template</EmptyTitle>
              <EmptyDescription>
                A template is a photo of the background you want, plus instructions. Then drop in
                product photos and each one is placed into that scene.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => setCreating(true)}>
                <PlusIcon data-icon="inline-start" />
                New template
              </Button>
            </EmptyContent>
          </Empty>
        )}
      </main>

      <TemplateDialog open={creating} onOpenChange={setCreating} onSaved={showTemplate} />
    </div>
  )
}
