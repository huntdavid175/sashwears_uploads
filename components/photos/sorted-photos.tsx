"use client"

import { XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { imageUrl, type Classified, type SortedPhoto } from "@/lib/client"
import type { PhotoView, Shot } from "@/lib/types"

import { nextKey } from "./photo-drop"

/** Photos the AI put in one colour; the owner can rename it and move photos around. */
export type ColorGroup = { key: string; name: string; photos: SortedPhoto[] }

/** Select value that moves a photo into a colour of its own. */
export const NEW_GROUP = "__new"

/** Same colour name (any case) → same group, in the order colours first appear; shot order inside. */
export function groupByColor<G extends ColorGroup>(
  photos: Classified["photos"],
  shots: Shot[],
  extra: () => Omit<G, keyof ColorGroup>,
): G[] {
  const groups: G[] = []
  for (const { color, ...photo } of photos) {
    const existing = groups.find((g) => g.name.toLowerCase() === color.toLowerCase())
    if (existing) existing.photos.push(photo)
    else groups.push({ ...extra(), key: nextKey(), name: color, photos: [photo] } as G)
  }
  const order = (view: string) => shots.findIndex((s) => s.key === view)
  for (const g of groups) g.photos.sort((a, b) => order(a.view) - order(b.view))
  return groups
}

export function setPhotoView<G extends ColorGroup>(groups: G[], fileId: string, view: PhotoView) {
  return groups.map((g) => ({
    ...g,
    photos: g.photos.map((p) => (p.fileId === fileId ? { ...p, view } : p)),
  }))
}

/** Move a photo to another colour (or a new one); empty colours disappear. */
export function movePhoto<G extends ColorGroup>(
  groups: G[],
  fileId: string,
  target: string,
  extra: () => Omit<G, keyof ColorGroup>,
) {
  const photo = groups.flatMap((g) => g.photos).find((p) => p.fileId === fileId)!
  let next = groups.map((g) => ({ ...g, photos: g.photos.filter((p) => p.fileId !== fileId) }))
  if (target === NEW_GROUP) {
    next.push({ ...extra(), key: nextKey(), name: "", photos: [photo] } as G)
  } else {
    next = next.map((g) => (g.key === target ? { ...g, photos: [...g.photos, photo] } : g))
  }
  return next.filter((g) => g.photos.length)
}

export function dropPhoto<G extends ColorGroup>(groups: G[], fileId: string) {
  return groups
    .map((g) => ({ ...g, photos: g.photos.filter((p) => p.fileId !== fileId) }))
    .filter((g) => g.photos.length)
}

/** "Colour 2" for an unnamed colour. */
export function colorLabel(group: ColorGroup, index: number) {
  return group.name.trim() || `Colour ${index + 1}`
}

/** One sorted photo: preview, which shot it shows, which colour it belongs to, leave it out. */
export function SortedPhotoTile({
  photo,
  groupKey,
  groups,
  shots,
  onView,
  onMove,
  onDrop,
  disabled,
}: {
  photo: SortedPhoto
  groupKey: string
  groups: ColorGroup[]
  /** The shots a photo can be: the template's, or the default ones. */
  shots: Shot[]
  onView: (view: PhotoView) => void
  onMove: (target: string) => void
  onDrop: () => void
  disabled?: boolean
}) {
  const colorItems = [
    ...groups.map((g, i) => ({ value: g.key, label: colorLabel(g, i) })),
    { value: NEW_GROUP, label: "New colour" },
  ]
  const shotItems = shots.map((s) => ({ value: s.key, label: s.name }))

  return (
    <li className="flex flex-col gap-1.5">
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element -- ImageKit resizes it */}
        <img
          src={imageUrl(photo.image, { width: 360 })}
          alt={photo.originalName || "Product photo"}
          className="aspect-[3/4] w-full rounded-sm bg-muted object-cover"
        />
        <Button
          type="button"
          size="icon-xs"
          variant="secondary"
          aria-label="Leave this photo out"
          disabled={disabled}
          onClick={onDrop}
          className="absolute top-1 right-1"
        >
          <XIcon />
        </Button>
      </div>
      {shots.length <= 3 ? (
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          value={[photo.view]}
          onValueChange={(v) => v[0] && onView(v[0])}
          disabled={disabled}
          aria-label="Shot"
          className="w-full"
        >
          {shots.map((s) => (
            <ToggleGroupItem key={s.key} value={s.key} className="flex-1 px-1">
              {s.name}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      ) : (
        <Select
          items={shotItems}
          value={photo.view}
          onValueChange={(v) => v && onView(v)}
          disabled={disabled}
        >
          <SelectTrigger size="sm" className="w-full" aria-label="Shot">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {shotItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      )}
      <Select
        items={colorItems}
        value={groupKey}
        onValueChange={(v) => v && v !== groupKey && onMove(v)}
        disabled={disabled}
      >
        <SelectTrigger size="sm" className="w-full" aria-label="Colour">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {colorItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </li>
  )
}
