"use client"

import { ChevronRightIcon, SparklesIcon, UserRoundPlusIcon } from "lucide-react"
import Link from "next/link"
import { useId, useState } from "react"

import { PhotoDrop, usePickedPhotos } from "@/components/photos/photo-drop"
import { groupByColor } from "@/components/photos/sorted-photos"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { classifyPhotos, imageUrl, useTemplates } from "@/lib/client"
import { MAX_SHOOT_PHOTOS } from "@/lib/shoot"
import { isReady, type Template } from "@/lib/types"

import { KindTag } from "./kind-tag"
import { ShootReview, type Review } from "./shoot-review"

const nothing = () => ({})

/**
 * "Template set": pick a template and drop every photo of one product; the AI sorts them by
 * colour and by the template's shots and suggests a name and description; then the owner
 * reviews (ShootReview) and generates every colour in every shot.
 */
export function ShootForm({
  onReviewingChange,
}: {
  /** The review step is open: the page hides its type switch (switching would discard it). */
  onReviewingChange?: (reviewing: boolean) => void
}) {
  const id = useId()
  const { templates, error: templatesError } = useTemplates()
  const photos = usePickedPhotos(MAX_SHOOT_PHOTOS)
  const [chosen, setChosen] = useState<string | null>(null)
  const [review, setReviewState] = useState<Review | null>(null)
  const [attempted, setAttempted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const busy = progress !== null

  const ready = (templates ?? []).filter(isReady)
  const waiting = (templates ?? []).length - ready.length
  // The list comes default first; the owner's pick wins once made.
  const template = ready.find((t) => t.id === chosen) ?? ready[0]

  function setReview(next: Review | null) {
    setReviewState(next)
    onReviewingChange?.(next !== null)
  }

  /** Upload, let the AI sort into the template's shots and describe, group by colour. */
  async function sortPhotos(e: React.FormEvent) {
    e.preventDefault()
    setAttempted(true)
    if (!template) return setError("Pick a template.")
    if (!photos.picked.length) return setError("Add the product's photos.")
    setError(null)
    try {
      const files = await photos.uploadAll((done, total) =>
        setProgress(`Uploading photos ${done} of ${total}…`),
      )
      setProgress("Sorting by colour and shot…")
      const result = await classifyPhotos(files, { templateId: template.id, describe: true })
      setReview({
        name: result.name,
        description: result.description,
        warning: result.warning,
        groups: groupByColor(result.photos, template.shots, nothing),
      })
      setAttempted(false)
      window.scrollTo({ top: 0, behavior: "smooth" })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setProgress(null)
    }
  }

  if (review && template) {
    return <ShootReview initial={review} template={template} onBack={() => setReview(null)} />
  }

  return (
    <form
      onSubmit={sortPhotos}
      className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]"
      noValidate
    >
      <div className="flex min-w-0 flex-col gap-4">
        <Card size="sm">
          <CardHeader className="border-b">
            <CardTitle>Template</CardTitle>
            <CardDescription>Decides the look and the shots every colour gets.</CardDescription>
            <CardAction>
              <Button
                variant="link"
                size="sm"
                nativeButton={false}
                render={<Link href="/templates" />}
              >
                Manage
                <ChevronRightIcon data-icon="inline-end" />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {templatesError && !templates ? (
              <FieldError>{templatesError}</FieldError>
            ) : !templates ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <Skeleton className="h-36" />
                <Skeleton className="h-36" />
              </div>
            ) : !template ? (
              <Empty className="border border-dashed">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <UserRoundPlusIcon />
                  </EmptyMedia>
                  <EmptyTitle>Make a template first</EmptyTitle>
                  <EmptyDescription>
                    A model or a scene, the shots you want (front, back, side…) and a photo for
                    each.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button nativeButton={false} render={<Link href="/templates" />}>
                    Create a template
                  </Button>
                </EmptyContent>
              </Empty>
            ) : (
              <div className="flex flex-col gap-2">
                <RadioGroup
                  value={template.id}
                  onValueChange={(v) => setChosen(v as string)}
                  disabled={busy}
                  aria-label="Template"
                  className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
                >
                  {ready.map((t) => (
                    <TemplateChoice key={t.id} template={t} id={`${id}-t-${t.id}`} />
                  ))}
                </RadioGroup>
                {waiting > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {waiting} older template{waiting === 1 ? " needs" : "s need"} shots before it
                    can be used.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader className="border-b">
            <CardTitle>Product photos</CardTitle>
            <CardDescription>
              Every photo of one product, in all its colours and from any side. A colour missing a
              shot borrows it from another colour.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PhotoDrop
              id={`${id}-files`}
              picked={photos.picked}
              onAdd={photos.add}
              onRemove={photos.remove}
              disabled={busy}
              invalid={attempted && !photos.picked.length}
            />
          </CardContent>
        </Card>
      </div>

      <Card size="sm" className="xl:sticky xl:top-28">
        <CardHeader className="border-b">
          <CardTitle>Next: sort</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {template && (
            <div className="flex flex-col gap-1.5 text-sm">
              <span className="font-semibold">{template.name}</span>
              <span className="flex flex-wrap gap-1">
                {template.shots.map((s) => (
                  <Badge key={s.key} variant="outline">
                    {s.name}
                  </Badge>
                ))}
              </span>
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            <span className="text-2xl font-bold text-foreground">{photos.picked.length}</span> photo
            {photos.picked.length === 1 ? "" : "s"} selected
          </p>
          <Button type="submit" disabled={busy || !template} className="w-full">
            {busy ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <SparklesIcon data-icon="inline-start" />
            )}
            {progress ?? "Sort by colour and shot"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Nothing is generated yet: you check the sorting first.
          </p>
          {error && <FieldError>{error}</FieldError>}
        </CardContent>
      </Card>
    </form>
  )
}

/** A template as a choice card: its shot photos in a strip, its name, kind and shots. */
function TemplateChoice({ template, id }: { template: Template; id: string }) {
  return (
    <FieldLabel
      htmlFor={id}
      className="rounded-sm has-data-checked:border-primary has-data-checked:bg-card! has-data-checked:ring-1 has-data-checked:ring-primary"
    >
      <Field orientation="horizontal" className="items-start">
        <FieldContent className="min-w-0 gap-2">
          <div className="grid grid-cols-4 gap-1">
            {template.shots.slice(0, 4).map((s) => (
              // eslint-disable-next-line @next/next/no-img-element -- ImageKit resizes it
              <img
                key={s.key}
                src={imageUrl(s.reference, { width: 160 })}
                alt={s.name}
                className="aspect-[3/4] w-full rounded-[2px] bg-muted object-cover"
              />
            ))}
          </div>
          <FieldTitle className="line-clamp-2">{template.name}</FieldTitle>
          <FieldDescription className="flex flex-wrap items-center gap-1 text-xs">
            <KindTag kind={template.kind} />
            {template.shots.map((s) => s.name).join(" · ")}
          </FieldDescription>
        </FieldContent>
        <RadioGroupItem value={template.id} id={id} />
      </Field>
    </FieldLabel>
  )
}
