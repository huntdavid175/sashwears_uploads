"use client"

import { ArrowLeftIcon, ChevronDownIcon, SparklesIcon, TriangleAlertIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useId, useState } from "react"

import {
  colorLabel,
  dropPhoto,
  movePhoto,
  setPhotoView,
  SortedPhotoTile,
  type ColorGroup,
} from "@/components/photos/sorted-photos"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { api, imageUrl, type SortedPhoto } from "@/lib/client"
import { estimateCost } from "@/lib/models"
import { MAX_DESCRIPTION, MAX_PER_SIDE, planShoot, type PlannedImage } from "@/lib/shoot"
import { pickSize } from "@/lib/size"
import type { Shoot, Template } from "@/lib/types"
import { cn } from "@/lib/utils"

import { KindTag } from "./kind-tag"

/** The AI's suggestion, as the owner edits it. */
export type Review = { name: string; description: string; warning?: string; groups: ColorGroup[] }

type Planned = PlannedImage<SortedPhoto>

const nothing = () => ({})

/**
 * Check the AI's sorting before spending anything: name and description, the photos of each
 * colour, and the shot mosaic: what each colour × shot will be made from. Generate starts the set.
 */
export function ShootReview({
  initial,
  template,
  onBack,
}: {
  initial: Review
  template: Template
  onBack: () => void
}) {
  const id = useId()
  const router = useRouter()
  const [review, setReview] = useState(initial)
  const [attempted, setAttempted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  // Colours whose sort tools are open (a colour with a problem is always open).
  const [fixing, setFixing] = useState<Set<string>>(() => new Set())

  const { groups } = review
  const { shots } = template
  const plan = planShoot(
    groups.map((g, i) => ({
      name: colorLabel(g, i),
      photos: g.photos.map((p) => ({ view: p.view, image: p })),
    })),
    shots,
  )
  const issues = problems(groups)
  const guessed = shots.filter((s) =>
    plan.some((p) => p.shot.key === s.key && p.basis === "guessed"),
  )
  const cost = plan.reduce((sum, p) => {
    const ref = shots.find((s) => s.key === p.shot.key)!.reference
    const size = pickSize(template.model, ref.width, ref.height)
    return sum + estimateCost(template.model, template.quality, size, p.inputs.length + 1)
  }, 0)

  function updateGroups(fn: (list: ColorGroup[]) => ColorGroup[]) {
    setReview((r) => ({ ...r, groups: fn(r.groups) }))
  }

  async function generate() {
    setAttempted(true)
    const issue = !review.name.trim() ? "Give the set a name." : issues.first
    setError(issue)
    if (issue) return
    setStarting(true)
    try {
      const shoot = await api<Shoot>("/api/shoots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: template.id,
          name: review.name,
          description: review.description,
          colors: groups.map((g) => ({
            name: g.name,
            photos: g.photos.map((p) => ({ fileId: p.fileId, view: p.view })),
          })),
        }),
      })
      router.push(`/shoots/${shoot.id}`)
    } catch (err) {
      setError((err as Error).message)
      setStarting(false)
    }
  }

  const generateButton = (className?: string) => (
    <Button type="button" onClick={generate} disabled={starting} className={className}>
      {starting ? <Spinner data-icon="inline-start" /> : <SparklesIcon data-icon="inline-start" />}
      {starting ? "Starting…" : `Generate ${plan.length} images`}
    </Button>
  )
  // The cost is the hero figure: large, heavy, red.
  const cost$ = (size: string) => (
    <span className={cn("leading-none font-black text-primary", size)}>US${cost.toFixed(2)}</span>
  )

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[12rem_minmax(0,1fr)_18rem]">
      {/* Left rail: what was found. Desktop only; each colour header repeats it on phones. */}
      <Card size="sm" className="hidden gap-0 py-0 lg:sticky lg:top-28 lg:flex">
        <CardHeader className="border-b py-2">
          <CardTitle>Colours</CardTitle>
        </CardHeader>
        <ul className="text-sm">
          {groups.map((g, i) => (
            <li key={g.key} className="flex justify-between gap-2 border-b px-3 py-1.5">
              <span className="truncate">{colorLabel(g, i)}</span>
              <span className="font-bold text-primary">{g.photos.length}</span>
            </li>
          ))}
        </ul>
        <CardHeader className="border-b py-2">
          <CardTitle>Shots covered</CardTitle>
        </CardHeader>
        <ul className="text-sm">
          {shots.map((s) => {
            const have = plan.filter((p) => p.shot.key === s.key && p.basis === "photo").length
            return (
              <li key={s.key} className="flex justify-between gap-2 border-b px-3 py-1.5">
                <span className="truncate">{s.name}</span>
                <span className={cn("font-bold", have < groups.length && "text-primary")}>
                  {have}/{groups.length}
                </span>
              </li>
            )
          })}
        </ul>
        <div className="flex flex-col gap-1.5 px-3 py-2.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Badge variant="ink">Photo</Badge> from your photo
          </span>
          <span className="flex items-center gap-1.5">
            <Badge>Borrowed</Badge> another colour&apos;s design
          </span>
          <span className="flex items-center gap-1.5">
            <Badge variant="alert">Guess</Badge> no colour has it
          </span>
        </div>
      </Card>

      {/* Centre: one module per colour, its photos, then its shot mosaic. */}
      <div className="flex min-w-0 flex-col gap-4">
        {/* Phones: the coverage rail, compact, above the mosaic. */}
        <Card size="sm" className="lg:hidden">
          <CardContent className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="mr-1 font-bold">Shots covered</span>
            {shots.map((s) => {
              const have = plan.filter((p) => p.shot.key === s.key && p.basis === "photo").length
              return (
                <Badge key={s.key} variant={have < groups.length ? "alert" : "outline"}>
                  {s.name} {have}/{groups.length}
                </Badge>
              )
            })}
          </CardContent>
        </Card>
        <Alert>
          {review.warning ? <TriangleAlertIcon /> : <SparklesIcon />}
          <AlertDescription>
            {review.warning ??
              `Sorted ${groups.reduce((n, g) => n + g.photos.length, 0)} photos into ${groups.length} colour${groups.length === 1 ? "" : "s"} for ${template.name}. Check what each image is made from, then generate.`}
          </AlertDescription>
        </Alert>
        {guessed.length > 0 && (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertDescription>
              No colour has a {guessed.map((s) => s.name.toLowerCase()).join(" or ")} photo, so the
              AI will invent {guessed.length === 1 ? "that side" : "those sides"}. Add one such
              photo of any colour for an accurate result.
            </AlertDescription>
          </Alert>
        )}

        {/* One ruled row per colour: its name, its shot mosaic; the sort tools fold away. */}
        {groups.map((g, i) => {
          const issue = issues.byGroup.get(g.key)
          const open = fixing.has(g.key) || Boolean(issue)
          return (
            <Card key={g.key} size="sm">
              <CardHeader className="border-b">
                <CardTitle>
                  <Input
                    value={g.name}
                    onChange={(e) =>
                      updateGroups((list) =>
                        list.map((x) => (x.key === g.key ? { ...x, name: e.target.value } : x)),
                      )
                    }
                    maxLength={40}
                    disabled={starting}
                    placeholder={`Colour ${i + 1}`}
                    aria-label={`Colour ${i + 1} name`}
                    aria-invalid={attempted && !g.name.trim() ? true : undefined}
                    className="h-8 max-w-56 font-bold"
                  />
                </CardTitle>
                <CardDescription>
                  {g.photos.length} photo{g.photos.length === 1 ? "" : "s"} → {shots.length} image
                  {shots.length === 1 ? "" : "s"}
                </CardDescription>
                {!issue && (
                  <CardAction>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-expanded={open}
                      onClick={() =>
                        setFixing((set) => {
                          const next = new Set(set)
                          if (next.has(g.key)) next.delete(g.key)
                          else next.add(g.key)
                          return next
                        })
                      }
                    >
                      {open ? "Done" : "Fix sorting"}
                      <ChevronDownIcon
                        data-icon="inline-end"
                        className={cn("transition-transform", open && "rotate-180")}
                      />
                    </Button>
                  </CardAction>
                )}
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {issue && <FieldError>{issue}</FieldError>}
                <ShotMosaic
                  label={colorLabel(g, i)}
                  images={plan.filter((p) => p.color === colorLabel(g, i))}
                  template={template}
                />
                {open && (
                  <section
                    aria-label={`Photos of ${colorLabel(g, i)}`}
                    className="flex flex-col gap-2 rounded-sm border bg-muted p-2"
                  >
                    <h3 className="text-xs font-bold">
                      Your photos: set each one&apos;s shot and colour
                    </h3>
                    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 xl:grid-cols-6">
                      {g.photos.map((p) => (
                        <SortedPhotoTile
                          key={p.fileId}
                          photo={p}
                          groupKey={g.key}
                          groups={groups}
                          shots={shots}
                          onView={(view) => updateGroups((l) => setPhotoView(l, p.fileId, view))}
                          onMove={(target) =>
                            updateGroups((l) => movePhoto(l, p.fileId, target, nothing))
                          }
                          onDrop={() => updateGroups((l) => dropPhoto(l, p.fileId))}
                          disabled={starting}
                        />
                      ))}
                    </ul>
                  </section>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Right rail: the set, the cost, the one red button. */}
      <Card size="sm" className="lg:sticky lg:top-28">
        <CardHeader className="border-b">
          <CardTitle>The set</CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-1.5">
            {template.name} <KindTag kind={template.kind} />
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="gap-4">
            <Field data-invalid={attempted && !review.name.trim() ? true : undefined}>
              <FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
              <Input
                id={`${id}-name`}
                value={review.name}
                onChange={(e) => setReview((r) => ({ ...r, name: e.target.value }))}
                maxLength={80}
                disabled={starting}
                aria-invalid={attempted && !review.name.trim() ? true : undefined}
              />
              <FieldDescription>Names the folder and every file in it.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-description`}>Description</FieldLabel>
              <Textarea
                id={`${id}-description`}
                value={review.description}
                onChange={(e) => setReview((r) => ({ ...r, description: e.target.value }))}
                maxLength={MAX_DESCRIPTION}
                rows={5}
                disabled={starting}
              />
              <FieldDescription>Saved in the folder as description.txt.</FieldDescription>
            </Field>
            <div className="flex flex-col gap-1 border-t pt-3">
              <span className="text-xs text-muted-foreground">Estimated OpenAI cost</span>
              {cost$("text-3xl")}
              <span className="text-sm text-muted-foreground">
                {plan.length} images · {groups.length} colour{groups.length === 1 ? "" : "s"} ×{" "}
                {shots.length} shot{shots.length === 1 ? "" : "s"} · a minute or two each, two at a
                time
              </span>
            </div>
            {generateButton("hidden w-full lg:inline-flex")}
            {error && <FieldError>{error}</FieldError>}
            <Button type="button" variant="ghost" size="sm" disabled={starting} onClick={onBack}>
              <ArrowLeftIcon data-icon="inline-start" />
              Back to photos
            </Button>
          </FieldGroup>
        </CardContent>
      </Card>

      {/* Phones: the spending action stays in reach. */}
      <div className="sticky bottom-3 flex items-center justify-between gap-3 rounded-lg border bg-card p-3 shadow-lg lg:hidden">
        <div className="flex min-w-0 flex-col">
          {cost$("text-xl")}
          <span className="text-xs text-muted-foreground">{plan.length} images, estimated</span>
        </div>
        {generateButton()}
      </div>
    </div>
  )
}

/** Problems per colour (by key), plus the first overall problem. */
function problems(groups: ColorGroup[]) {
  const byGroup = new Map<string, string>()
  const seen = new Set<string>()
  groups.forEach((g, i) => {
    const label = colorLabel(g, i)
    const views = g.photos.map((p) => p.view)
    const crowded = views.find((v) => views.filter((x) => x === v).length > MAX_PER_SIDE)
    const lower = g.name.trim().toLowerCase()
    const issue = !lower
      ? `Name colour ${i + 1}.`
      : seen.has(lower)
        ? `"${label}" is listed twice.`
        : crowded
          ? `${label}: keep up to ${MAX_PER_SIDE} photos per shot.`
          : null
    seen.add(lower)
    if (issue) byGroup.set(g.key, issue)
  })
  return { byGroup, first: [...byGroup.values()][0] ?? null }
}

const BASIS: Record<
  Planned["basis"],
  { tag: string; variant: "ink" | "default" | "alert"; line: (p: Planned) => string }
> = {
  photo: { tag: "Photo", variant: "ink", line: () => "From your photo" },
  borrowed: { tag: "Borrowed", variant: "default", line: (p) => `Design from ${p.from}` },
  guessed: { tag: "Guess", variant: "alert", line: () => "No colour has this shot" },
}

/**
 * The signature: one ruled module per shot this colour gets. The shot's reference sits faded
 * behind the product photo it's made from; the tab says where it comes from.
 */
function ShotMosaic({
  label,
  images,
  template,
}: {
  label: string
  images: Planned[]
  template: Template
}) {
  return (
    <section aria-label={`Images for ${label}`} className="flex flex-col gap-2">
      {/* One column per shot (no empty tracks), tiles capped so two shots don't balloon. */}
      <ul
        className="grid grid-cols-2 gap-2 sm:max-w-[calc(var(--shots)*12rem)] sm:grid-cols-[repeat(var(--shots),minmax(0,1fr))]"
        style={{ "--shots": images.length } as React.CSSProperties}
      >
        {images.map((img) => {
          const ref = template.shots.find((s) => s.key === img.shot.key)!.reference
          const own = img.inputs.find((i) => i.role !== "design") ?? img.inputs[0]
          const basis = BASIS[img.basis]
          return (
            <li key={img.shot.key} className="overflow-hidden rounded-sm border">
              <div className="relative aspect-[4/5] bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element -- ImageKit resizes it */}
                <img
                  src={imageUrl(ref, { width: 320 })}
                  alt=""
                  className="size-full object-cover opacity-40"
                />
                {own && (
                  // eslint-disable-next-line @next/next/no-img-element -- ImageKit resizes it
                  <img
                    src={imageUrl(own.image.image, { width: 200 })}
                    alt=""
                    className="absolute right-2 bottom-2 aspect-[3/4] w-1/2 rounded-[2px] object-cover shadow-md ring-2 ring-card"
                  />
                )}
                <Badge variant={basis.variant} className="absolute top-1.5 left-1.5">
                  {basis.tag}
                </Badge>
              </div>
              <div className="flex flex-col border-t px-2 py-1.5 text-xs">
                <span className="text-sm font-bold">{img.shot.name}</span>
                <span className="truncate text-muted-foreground">{basis.line(img)}</span>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
