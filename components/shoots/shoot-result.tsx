"use client"

import { DownloadIcon, FolderDownIcon, PlusIcon, RefreshCwIcon, RotateCcwIcon } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useState } from "react"

import { Elapsed } from "@/components/elapsed"
import { Page, PageHeader } from "@/components/page"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { api, downloadShootZip, imageUrl, useShoot } from "@/lib/client"
import type { Shoot, ShootImage } from "@/lib/types"

/** Tiles are at most ~14rem wide; 2x for sharp screens. */
const PREVIEW_WIDTH = 480

/** A set as it generates (polled), from the id in the URL. */
export function ShootResult() {
  const { id } = useParams<{ id: string }>()
  const { shoot, error, refresh, setShoot } = useShoot(id)

  async function redo(image: ShootImage) {
    try {
      setShoot(
        await api<Shoot>(`/api/shoots/${id}/images/${image.id}/regenerate`, { method: "POST" }),
      )
      refresh()
    } catch (err) {
      toast.add({ type: "error", title: "Couldn't start it", description: (err as Error).message })
    }
  }

  if (error && !shoot) {
    return (
      <Page>
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load this set</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </Page>
    )
  }
  if (!shoot) {
    return (
      <Page>
        <Skeleton className="h-16" />
        <Skeleton className="h-96" />
      </Page>
    )
  }
  return <ShootView shoot={shoot} onRedo={redo} />
}

/** Every colour's shots as they finish (a contact sheet), then one .zip of the folder. */
export function ShootView({
  shoot,
  onRedo,
}: {
  shoot: Shoot
  onRedo: (image: ShootImage) => void
}) {
  const [zipping, setZipping] = useState<string | null>(null)

  async function download(s: Shoot) {
    setZipping("Preparing…")
    try {
      await downloadShootZip(s, (done, total) => setZipping(`Downloading ${done} of ${total}…`))
    } catch (err) {
      toast.add({
        type: "error",
        title: "Couldn't make the .zip",
        description: (err as Error).message,
      })
    } finally {
      setZipping(null)
    }
  }

  const images = shoot.colors.flatMap((c) => c.images)
  const count = (status: ShootImage["status"]) => images.filter((i) => i.status === status).length
  const done = count("done")
  const failed = count("failed")
  const generating = shoot.status === "generating"
  const shots = shoot.colors[0]?.images.length ?? 0

  return (
    <Page>
      <PageHeader title={shoot.name}>
        <div className="flex flex-wrap gap-1">
          <Badge variant="outline">
            {shoot.colors.length} colour{shoot.colors.length === 1 ? "" : "s"}
          </Badge>
          <Badge variant="outline">
            {shots} shot{shots === 1 ? "" : "s"} each
          </Badge>
          <Badge variant="outline">Folder {shoot.handle}</Badge>
        </div>
      </PageHeader>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        {/* The contact sheet: one module per colour, its shots tiled inside. */}
        <div className="flex min-w-0 flex-col gap-4">
          {shoot.colors.map((color) => (
            <Card key={color.name} size="sm">
              <CardHeader className="border-b">
                <CardTitle>{color.name}</CardTitle>
                <CardDescription>
                  {color.images.filter((i) => i.status === "done").length}/{color.images.length}{" "}
                  done
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* One column per shot (no empty tracks), tiles capped in width. */}
                <ul
                  className="grid grid-cols-2 gap-2 sm:max-w-[calc(var(--shots)*14rem)] sm:grid-cols-[repeat(var(--shots),minmax(0,1fr))]"
                  style={{ "--shots": color.images.length } as React.CSSProperties}
                >
                  {color.images.map((image) => (
                    <ResultTile key={image.id} image={image} onRedo={onRedo} />
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card size="sm" className="order-first lg:sticky lg:top-28 lg:order-none">
          <CardHeader className="border-b">
            <CardTitle>{generating ? "Generating" : failed ? "Needs a retry" : "Ready"}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm">
                <span className="text-2xl font-bold">{done}</span>
                <span className="text-muted-foreground"> / {images.length} images done</span>
              </span>
              <Progress value={(done / images.length) * 100} aria-label="Images finished" />
            </div>
            <div className="flex flex-wrap gap-1">
              {failed > 0 && <Badge>Failed {failed}</Badge>}
              {count("processing") > 0 && (
                <Badge variant="outline">Working {count("processing")}</Badge>
              )}
              {count("queued") > 0 && <Badge variant="outline">Waiting {count("queued")}</Badge>}
              {done > 0 && <Badge variant="ink">Done {done}</Badge>}
            </div>
            <Button
              onClick={() => download(shoot)}
              disabled={generating || done === 0 || zipping !== null}
              className="w-full"
            >
              {zipping ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <FolderDownIcon data-icon="inline-start" />
              )}
              {zipping ?? (failed && !generating ? `Download ${done} as .zip` : "Download .zip")}
            </Button>
            <p className="text-xs text-muted-foreground">
              {generating
                ? "A minute or two per image. The .zip is ready when they all finish; Save any finished one meanwhile. You can leave and come back with this page's link."
                : failed
                  ? "Retry the failed ones, or download what's finished."
                  : "One folder with every image and description.txt."}
            </p>
            {shoot.description && (
              <p className="border-t pt-3 text-sm text-pretty">{shoot.description}</p>
            )}
            <Button variant="outline" nativeButton={false} render={<Link href="/" />}>
              <PlusIcon data-icon="inline-start" />
              New set
            </Button>
          </CardContent>
        </Card>
      </div>
    </Page>
  )
}

const STATE: Record<
  ShootImage["status"],
  { label: string; variant: "ink" | "default" | "alert" | "outline" }
> = {
  done: { label: "Done", variant: "ink" },
  processing: { label: "Working", variant: "outline" },
  queued: { label: "Waiting", variant: "outline" },
  failed: { label: "Failed", variant: "default" },
}

function ResultTile({ image, onRedo }: { image: ShootImage; onRedo: (image: ShootImage) => void }) {
  const running = image.status === "queued" || image.status === "processing"
  const shown = !running && image.output
  const placeholder = image.inputs[0]?.image
  const state = STATE[image.status]

  return (
    <li className="flex flex-col overflow-hidden rounded-sm border">
      <div className="relative aspect-[3/4] bg-muted">
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- ImageKit resizes it
          <img
            src={imageUrl(image.output!, { width: PREVIEW_WIDTH })}
            alt={`${image.color}, ${image.shotName}`}
            className="size-full object-cover"
          />
        ) : (
          placeholder && (
            // The product photo it's made from, quiet, until the result lands.
            // eslint-disable-next-line @next/next/no-img-element -- ImageKit resizes it
            <img
              src={imageUrl(placeholder, { width: 320 })}
              alt=""
              className="size-full object-cover opacity-25 grayscale"
            />
          )
        )}
        <Badge variant={state.variant} className="absolute top-1.5 left-1.5">
          {image.status === "processing" && <Spinner data-icon="inline-start" />}
          {state.label}
          {image.status === "processing" && image.startedAt && <Elapsed since={image.startedAt} />}
        </Badge>
      </div>
      <div className="flex flex-col gap-1 border-t px-2 py-1.5">
        <span className="text-sm font-bold">{image.shotName}</span>
        {image.status === "failed" && image.error && (
          <p className="text-xs text-destructive" role="alert">
            {image.error}
          </p>
        )}
        {!running && (
          <div className="-mx-1.5 flex flex-wrap">
            {image.output && (
              <Button
                size="xs"
                variant="ghost"
                nativeButton={false}
                render={<a href={imageUrl(image.output, { download: true })} download />}
              >
                <DownloadIcon data-icon="inline-start" />
                Save
              </Button>
            )}
            <Button size="xs" variant="ghost" onClick={() => onRedo(image)}>
              {image.status === "failed" ? (
                <RotateCcwIcon data-icon="inline-start" />
              ) : (
                <RefreshCwIcon data-icon="inline-start" />
              )}
              {image.status === "failed" ? "Retry" : "Redo"}
            </Button>
          </div>
        )}
      </div>
    </li>
  )
}
