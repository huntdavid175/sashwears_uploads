"use client"

import { CheckIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"

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
import type { Template } from "@/lib/types"

import { TemplateDialog } from "./template-dialog"

export function TemplateSettings() {
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
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">
            The background template every new dress is generated with.
          </p>
        </div>
        <Button onClick={() => setEditing("new")}>
          <PlusIcon data-icon="inline-start" />
          New template
        </Button>
      </header>

      {error && !templates ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load templates</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : templates === null ? (
        <Skeleton className="h-64" />
      ) : templates.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyTitle>Create your background template</EmptyTitle>
            <EmptyDescription>
              A photo of the background you want plus instructions. Dresses can&apos;t be generated
              until there is one.
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
        templates.map((t, i) => {
          // The server uses the marked default, else the first one listed.
          const inUse = t.isDefault || (i === 0 && !templates.some((x) => x.isDefault))
          return (
            <Card key={t.id}>
              <CardHeader>
                <CardTitle className="font-condensed text-xl">{t.name}</CardTitle>
                <CardDescription>
                  {MODEL_CAPS[t.model].label} · {t.quality} quality · {t.outputFormat.toUpperCase()}
                </CardDescription>
                <CardAction>
                  {inUse ? (
                    <Badge>
                      <CheckIcon data-icon="inline-start" />
                      Used for new dresses
                    </Badge>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => makeDefault(t)}>
                      Use for new dresses
                    </Button>
                  )}
                </CardAction>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 sm:flex-row">
                {/* eslint-disable-next-line @next/next/no-img-element -- ImageKit resizes it */}
                <img
                  src={imageUrl(t.reference, { width: 400 })}
                  alt={`${t.name} background`}
                  className="aspect-[3/4] w-32 shrink-0 rounded-md bg-muted object-cover"
                />
                <p className="text-sm whitespace-pre-line text-muted-foreground">{t.prompt}</p>
              </CardContent>
              <CardFooter className="gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(t)}>
                  <PencilIcon data-icon="inline-start" />
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDeleting(t)}>
                  <Trash2Icon data-icon="inline-start" />
                  Delete
                </Button>
              </CardFooter>
            </Card>
          )
        })
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
              Dresses already generated keep their photos. New dresses will use another template.
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
    </main>
  )
}
