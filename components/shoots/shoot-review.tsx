"use client"

import {
  ArrowLeftIcon,
  ChevronDownIcon,
  CombineIcon,
  SparklesIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useId, useState } from "react"

import { nextKey } from "@/components/photos/photo-drop"
import {
  colorLabel,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import {
  leaveOutPhoto,
  mergeProducts,
  movePhotoTo,
  newColorIn,
  NEW_PRODUCT,
  productLabel,
  type ProductGroup,
} from "@/lib/batch-review"
import { api, imageUrl, type SortedPhoto } from "@/lib/client"
import { estimateCost, MODEL_CAPS } from "@/lib/models"
import { MAX_DESCRIPTION, MAX_PER_SIDE, planShoot, type PlannedImage } from "@/lib/shoot"
import { cropsPhoto, pickSize } from "@/lib/size"
import type { Batch, Template } from "@/lib/types"
import { cn } from "@/lib/utils"

import { KindTag } from "./kind-tag"

/** The AI's suggestion, as the owner edits it. */
export type Review = { warning?: string; products: ProductGroup[] }

type Planned = PlannedImage<SortedPhoto>

function planProduct(product: ProductGroup, template: Template): Planned[] {
  return planShoot(
    product.groups.map((g, i) => ({
      name: colorLabel(g, i),
      photos: g.photos.map((p) => ({ view: p.view, image: p })),
    })),
    template.shots,
  )
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

/**
 * Check the AI's sorting before spending anything: which photos make a product (merge, move,
 * leave out), each product's name and description, and the shot mosaic: what each colour × shot
 * will be made from. Generate starts every product's set.
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

  const { products } = review
  const { shots } = template
  const plans = products.map((p) => planProduct(p, template))
  const images = plans.flat()
  const issues = problems(products)
  const cropped = shots.filter((s) =>
    cropsPhoto(template.model, s.reference.width, s.reference.height),
  )
  const shownError = (attempted && issues.first) || error
  const guessed = products.flatMap((p, i) => {
    const names = shots.filter((s) =>
      plans[i].some((img) => img.shot.key === s.key && img.basis === "guessed"),
    )
    return names.length
      ? [`${productLabel(p, i)} (${names.map((s) => s.name.toLowerCase()).join(", ")})`]
      : []
  })
  const cost = images.reduce((sum, p) => {
    const ref = shots.find((s) => s.key === p.shot.key)!.reference
    const size = pickSize(template.model, ref.width, ref.height)
    return sum + estimateCost(template.model, template.quality, size, p.inputs.length + 1)
  }, 0)

  function update(fn: (list: ProductGroup[]) => ProductGroup[]) {
    setReview((r) => ({ ...r, products: fn(r.products) }))
  }

  async function generate() {
    setAttempted(true)
    setError(null)
    if (issues.first) return
    setStarting(true)
    try {
      const batch = await api<Batch>("/api/shoots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: template.id,
          products: products.map((p) => ({
            name: p.name,
            description: p.description,
            productType: p.productType,
            tags: p.tags,
            colors: p.groups.map((g) => ({
              name: g.name,
              photos: g.photos.map((x) => ({ fileId: x.fileId, view: x.view })),
            })),
          })),
        }),
      })
      router.push(`/batches/${batch.id}`)
    } catch (err) {
      setError((err as Error).message)
      setStarting(false)
    }
  }

  const generateButton = (className?: string) => (
    <Button type="button" onClick={generate} disabled={starting} className={className}>
      {starting ? <Spinner data-icon="inline-start" /> : <SparklesIcon data-icon="inline-start" />}
      {starting ? "Starting…" : `Generate ${images.length} images`}
    </Button>
  )
  // The cost is the hero figure: large, heavy, red.
  const cost$ = (size: string) => (
    <span className={cn("leading-none font-black text-primary", size)}>US${cost.toFixed(2)}</span>
  )

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[13rem_minmax(0,1fr)_18rem]">
      {/* Left rail: what was found, and a way around a long page. Desktop only. */}
      <Card size="sm" className="hidden gap-0 py-0 lg:sticky lg:top-28 lg:flex">
        <CardHeader className="border-b py-2">
          <CardTitle>{plural(products.length, "product")}</CardTitle>
        </CardHeader>
        <ul className="text-sm">
          {products.map((p, i) => (
            <li key={p.key} className="border-b">
              <a
                href={`#${id}-${p.key}`}
                className="flex justify-between gap-2 px-3 py-1.5 hover:bg-muted"
              >
                <span className="truncate">{productLabel(p, i)}</span>
                <span className="font-bold text-primary">{plans[i].length}</span>
              </a>
            </li>
          ))}
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

      {/* Centre: one module per product, one ruled row per colour. */}
      <div className="flex min-w-0 flex-col gap-4">
        <Alert>
          {review.warning ? <TriangleAlertIcon /> : <SparklesIcon />}
          <AlertDescription>
            {review.warning ??
              `Sorted ${plural(photoCount(products), "photo")} into ${plural(products.length, "product")} for ${template.name}. Check each one's photos, then generate.`}
          </AlertDescription>
        </Alert>
        {cropped.length > 0 && (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertDescription>
              {cropped.map((s) => s.name).join(" and ")}: this photo&apos;s shape doesn&apos;t fit{" "}
              {MODEL_CAPS[template.model].label}, so the top and bottom of the results can get cut
              off. Switch this template to GPT Image 2 under Templates before generating.
            </AlertDescription>
          </Alert>
        )}
        {guessed.length > 0 && (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertDescription>
              No colour has a photo of these, so the AI will invent them: {guessed.join("; ")}. Add
              one such photo of any colour for an accurate result.
            </AlertDescription>
          </Alert>
        )}
        {products.map((p, i) => (
          <ProductModule
            key={p.key}
            id={`${id}-${p.key}`}
            product={p}
            index={i}
            products={products}
            plan={plans[i]}
            template={template}
            issues={issues}
            attempted={attempted}
            disabled={starting}
            onChange={(patch) =>
              update((list) => list.map((x) => (x.key === p.key ? { ...x, ...patch } : x)))
            }
            onProducts={update}
          />
        ))}
      </div>

      {/* Right rail: the batch, the cost, the one red button. */}
      <Card size="sm" className="lg:sticky lg:top-28">
        <CardHeader className="border-b">
          <CardTitle>This upload</CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-1.5">
            {template.name} <KindTag kind={template.kind} />
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Estimated OpenAI cost</span>
            {cost$("text-3xl")}
            <span className="text-sm text-muted-foreground">
              {plural(images.length, "image")} · {plural(products.length, "product")} ·{" "}
              {plural(shots.length, "shot")} per colour · a minute or two each, two at a time
            </span>
          </div>
          {generateButton("hidden w-full lg:inline-flex")}
          {shownError && <FieldError>{shownError}</FieldError>}
          <Button type="button" variant="ghost" size="sm" disabled={starting} onClick={onBack}>
            <ArrowLeftIcon data-icon="inline-start" />
            Back to photos
          </Button>
        </CardContent>
      </Card>

      {/* Phones: the spending action stays in reach. */}
      <div className="sticky bottom-3 flex items-center justify-between gap-3 rounded-lg border bg-card p-3 shadow-lg lg:hidden">
        <div className="flex min-w-0 flex-col">
          {cost$("text-xl")}
          <span className="text-xs text-muted-foreground">{images.length} images, estimated</span>
        </div>
        {generateButton()}
      </div>
    </div>
  )
}

const photoCount = (products: ProductGroup[]) =>
  products.reduce((n, p) => n + p.groups.reduce((m, g) => m + g.photos.length, 0), 0)

/** One product: its name, words and shots covered, then a row per colour. */
function ProductModule({
  id,
  product,
  index,
  products,
  plan,
  template,
  issues,
  attempted,
  disabled,
  onChange,
  onProducts,
}: {
  id: string
  product: ProductGroup
  index: number
  products: ProductGroup[]
  plan: Planned[]
  template: Template
  issues: ReturnType<typeof problems>
  attempted: boolean
  disabled: boolean
  onChange: (patch: Partial<ProductGroup>) => void
  onProducts: (fn: (list: ProductGroup[]) => ProductGroup[]) => void
}) {
  const label = productLabel(product, index)
  const others = products.flatMap((p, i) =>
    p.key === product.key ? [] : [{ key: p.key, label: productLabel(p, i) }],
  )
  const unnamed = attempted && !product.name.trim()

  /** Every colour a photo here can go to; colour first, so a narrow select still shows it. */
  const moveItems = [
    ...products.flatMap((p, i) =>
      p.groups.map((g, c) => ({
        value: g.key,
        label: others.length ? `${colorLabel(g, c)} · ${productLabel(p, i)}` : colorLabel(g, c),
      })),
    ),
    { value: newColorIn(product.key), label: "New colour" },
    { value: NEW_PRODUCT, label: "New product" },
  ]

  return (
    <Card id={id} size="sm" className="scroll-mt-28">
      <CardHeader className="border-b">
        <CardTitle>
          <Input
            value={product.name}
            onChange={(e) => onChange({ name: e.target.value })}
            maxLength={80}
            disabled={disabled}
            placeholder={`Product ${index + 1} name`}
            aria-label={`Product ${index + 1} name`}
            aria-invalid={unnamed ? true : undefined}
            className="h-8 max-w-md font-bold"
          />
        </CardTitle>
        <CardDescription>
          {plural(product.groups.length, "colour")} → {plural(plan.length, "image")}
        </CardDescription>
        {others.length > 0 && (
          <CardAction className="flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger
                disabled={disabled}
                render={<Button type="button" size="sm" variant="ghost" />}
              >
                <CombineIcon data-icon="inline-start" />
                Same product as…
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Merge into</DropdownMenuLabel>
                  {others.map((o) => (
                    <DropdownMenuItem
                      key={o.key}
                      onClick={() => onProducts((l) => mergeProducts(l, product.key, o.key))}
                    >
                      {o.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              disabled={disabled}
              aria-label={`Leave out ${label}`}
              title="Leave this product out"
              onClick={() => onProducts((l) => l.filter((p) => p.key !== product.key))}
            >
              <XIcon />
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {unnamed && <FieldError>{issues.byProduct.get(product.key)}</FieldError>}
        <Field>
          <FieldLabel htmlFor={`${id}-description`}>Description</FieldLabel>
          <Textarea
            id={`${id}-description`}
            value={product.description}
            onChange={(e) => onChange({ description: e.target.value })}
            maxLength={MAX_DESCRIPTION}
            rows={2}
            disabled={disabled}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="mr-1 font-bold">Shots covered</span>
          {template.shots.map((s) => {
            const have = plan.filter((p) => p.shot.key === s.key && p.basis === "photo").length
            return (
              <Badge key={s.key} variant={have < product.groups.length ? "alert" : "outline"}>
                {s.name} {have}/{product.groups.length}
              </Badge>
            )
          })}
        </div>
        {product.groups.map((g, i) => (
          <ColorRow
            key={g.key}
            group={g}
            index={i}
            product={product}
            plan={plan}
            template={template}
            moveItems={moveItems}
            issue={issues.byGroup.get(g.key)}
            attempted={attempted}
            disabled={disabled}
            onGroups={(groups) => onChange({ groups })}
            onProducts={onProducts}
          />
        ))}
      </CardContent>
    </Card>
  )
}

/** One colour: its name, its shot mosaic; the sort tools fold away. */
function ColorRow({
  group,
  index,
  product,
  plan,
  template,
  moveItems,
  issue,
  attempted,
  disabled,
  onGroups,
  onProducts,
}: {
  group: ColorGroup
  index: number
  product: ProductGroup
  plan: Planned[]
  template: Template
  moveItems: { value: string; label: string }[]
  issue?: string
  attempted: boolean
  disabled: boolean
  onGroups: (groups: ColorGroup[]) => void
  onProducts: (fn: (list: ProductGroup[]) => ProductGroup[]) => void
}) {
  const [fixing, setFixing] = useState(false)
  const label = colorLabel(group, index)
  // A colour with a problem is always open.
  const open = fixing || Boolean(issue)

  return (
    <section aria-label={label} className="flex flex-col gap-2 border-t pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Input
            value={group.name}
            onChange={(e) =>
              onGroups(
                product.groups.map((x) =>
                  x.key === group.key ? { ...x, name: e.target.value } : x,
                ),
              )
            }
            maxLength={40}
            disabled={disabled}
            placeholder={`Colour ${index + 1}`}
            aria-label={`Colour ${index + 1} name`}
            aria-invalid={attempted && !group.name.trim() ? true : undefined}
            className="h-8 max-w-44 font-bold"
          />
          <span className="text-xs whitespace-nowrap text-muted-foreground">
            {plural(group.photos.length, "photo")}
          </span>
        </div>
        {!issue && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-expanded={open}
            onClick={() => setFixing((f) => !f)}
          >
            {open ? "Done" : "Fix sorting"}
            <ChevronDownIcon
              data-icon="inline-end"
              className={cn("transition-transform", open && "rotate-180")}
            />
          </Button>
        )}
      </div>
      {issue && <FieldError>{issue}</FieldError>}
      <ShotMosaic
        label={label}
        images={plan.filter((p) => p.color === label)}
        template={template}
      />
      {open && (
        <div className="flex flex-col gap-2 rounded-sm border bg-muted p-2">
          <h3 className="text-xs font-bold">
            Your photos: set each one&apos;s shot and where it belongs
          </h3>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 xl:grid-cols-6">
            {group.photos.map((p) => (
              <SortedPhotoTile
                key={p.fileId}
                photo={p}
                groupKey={group.key}
                groups={product.groups}
                shots={template.shots}
                moveItems={moveItems}
                onView={(view) => onGroups(setPhotoView(product.groups, p.fileId, view))}
                onMove={(target) => onProducts((l) => movePhotoTo(l, p.fileId, target, nextKey))}
                onDrop={() => onProducts((l) => leaveOutPhoto(l, p.fileId))}
                disabled={disabled}
              />
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

/** Problems per colour and product (by key), plus the first overall problem. */
function problems(products: ProductGroup[]) {
  const byGroup = new Map<string, string>()
  const byProduct = new Map<string, string>()
  const first: string[] = []
  products.forEach((product, p) => {
    if (!product.name.trim()) {
      const issue = `Name product ${p + 1}.`
      byProduct.set(product.key, issue)
      first.push(issue)
    }
    const seen = new Set<string>()
    product.groups.forEach((g, i) => {
      const label = colorLabel(g, i)
      const views = g.photos.map((x) => x.view)
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
      if (issue) {
        byGroup.set(g.key, issue)
        first.push(`${productLabel(product, p)}: ${issue}`)
      }
    })
  })
  return { byGroup, byProduct, first: first[0] ?? null }
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
        className="grid grid-cols-2 gap-2 sm:max-w-[calc(var(--shots)*10rem)] sm:grid-cols-[repeat(var(--shots),minmax(0,1fr))]"
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
