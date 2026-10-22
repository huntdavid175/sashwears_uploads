"use client"

import { CheckIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"

import { Page, PageHeader } from "@/components/page"
import { KindTag } from "@/components/shoots/kind-tag"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/components/ui/toast"
import { api, imageUrl, useTemplates } from "@/lib/client"
import { MODEL_CAPS } from "@/lib/models"
import { isReady, type Template } from "@/lib/types"

import { TemplateDialog } from "./template-dialog"

export function Templates() {
  const { templates, error, refresh } = useTemplates()
  const [editing, setEditing] = useState<Template | "new" | null>(null)
  const [deleting, setDeleting] = useState<Template | null>(null)

  async function makeDefault(t: Template) {
    try {
      await api(`/api/templates/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: true }),
      })
      refresh()
    } catch (err) {
      toast.add({ type: "error", title: "Couldn't change", description: (err as Error).message })
    }
  }

  async function remove(t: Template) {
    try {
      await api(`/api/templates/${t.id}`, { method: "DELETE" })
      refresh()
    } catch (err) {
      toast.add({ type: "error", title: "Couldn't delete", description: (err as Error).message })
    }
  }

  return (
    <Page>
      <PageHeader
        title="Templates"
        description="Each one is a look (your model, or a scene) and the shots every colour of a product gets in it."
        actions={
          <Button onClick={() => setEditing("new")}>
            <PlusIcon data-icon="inline-start" />
            New template
          </Button>
        }
      />

      {error && !templates ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load templates</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : templates === null ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      ) : templates.length === 0 ? (
        <Empty className="border border-dashed bg-card">
          <EmptyHeader>
            <EmptyTitle>Make your first template</EmptyTitle>
            <EmptyDescription>
              Your model (for clothes, or holding a bag) or a scene (for an item on its own), and a
              photo for each shot you want: front, back, side…
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => setEditing("new")}>
              <PlusIcon data-icon="inline-start" />
              New template
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((t, i) => {
            const ready = isReady(t)
            // New sets start with the marked default, else the first one listed.
            const isDefault = t.isDefault || (i === 0 && !templates.some((x) => x.isDefault))
            return (
              <Card key={t.id} size="sm">
                <CardHeader className="border-b">
                  <CardTitle className="font-condensed text-lg font-bold">{t.name}</CardTitle>
                  <CardDescription className="flex flex-wrap items-center gap-1">
                    {ready && <KindTag kind={t.kind} />}
                    <span>
                      {MODEL_CAPS[t.model].label} · {t.quality} · {t.outputFormat.toUpperCase()}
                    </span>
                  </CardDescription>
                  <CardAction>
                    {!ready ? (
                      <Badge variant="alert">Needs shots</Badge>
                    ) : isDefault ? (
                      <Badge>
                        <CheckIcon data-icon="inline-start" />
                        Default
                      </Badge>
                    ) : null}
                  </CardAction>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {ready ? (
                    <ul className="grid grid-cols-4 gap-1.5">
                      {t.shots.map((s) => (
                        <li key={s.key} className="flex flex-col gap-1">
                          {/* eslint-disable-next-line @next/next/no-img-element -- ImageKit resizes it */}
                          <img
                            src={imageUrl(s.reference, { width: 200 })}
                            alt={s.name}
                            className="aspect-[3/4] w-full rounded-[2px] bg-muted object-cover"
                          />
                          <span className="truncate text-xs font-medium">{s.name}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="flex gap-3">
                      {t.reference && (
                        // eslint-disable-next-line @next/next/no-img-element -- ImageKit resizes it
                        <img
                          src={imageUrl(t.reference, { width: 200 })}
                          alt="Background (older template)"
                          className="aspect-[3/4] w-20 shrink-0 rounded-[2px] bg-muted object-cover"
                        />
                      )}
                      <p className="text-sm">
                        Made for the older background edits. Add its shots to use it for sets.
                      </p>
                    </div>
                  )}
                  <p className="line-clamp-3 text-sm whitespace-pre-line text-muted-foreground">
                    {t.prompt}
                  </p>
                </CardContent>
                <CardFooter className="gap-1">
                  <Button size="sm" variant="outline" onClick={() => setEditing(t)}>
                    <PencilIcon data-icon="inline-start" />
                    {ready ? "Edit" : "Add shots"}
                  </Button>
                  {ready && !isDefault && (
                    <Button size="sm" variant="ghost" onClick={() => makeDefault(t)}>
                      Make default
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto"
                    onClick={() => setDeleting(t)}
                  >
                    <Trash2Icon data-icon="inline-start" />
                    Delete
                  </Button>
                </CardFooter>
              </Card>
            )
          })}
        </div>
      )}

      <TemplateDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        template={editing === "new" || editing === null ? undefined : editing}
        onSaved={() => refresh()}
      />

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Sets and products already made keep their images.
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
              Delete template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  )
}
