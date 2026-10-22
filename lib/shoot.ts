/** Set and shot rules shared by the API (validation, planning) and the UI (review, forms). */

import type { GarmentRole, PhotoView, Shot } from "@/lib/types"

/** Product photos in one set. */
export const MAX_SHOOT_PHOTOS = 40
/** Photos of one colour and shot sent to an edit (more adds cost, not fidelity). */
export const MAX_PER_SIDE = 3
/** Photos of the colour's other shots sent along for colour and material. */
const MAX_OTHER_SHOTS = 2
export const MAX_DESCRIPTION = 1000
export const MAX_SHOTS = 8
export const MAX_SHOT_NAME = 30

/** The shots finished photos are sorted into when no template says otherwise. */
export const DEFAULT_SHOTS: Shot[] = [
  { key: "front", name: "Front" },
  { key: "back", name: "Back" },
  { key: "side", name: "Side" },
  { key: "inside", name: "Inside" },
  { key: "detail", name: "Detail" },
]

/** "Three-quarter" → "three-quarter": the shot's key in file names. */
export function shotKey(name: string) {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, MAX_SHOT_NAME) || "shot"
  )
}

/** A shot's name, else its key. */
export function shotName(shots: Shot[], key: string) {
  return shots.find((s) => s.key === key)?.name ?? key
}

export type PlannedInput<T> = {
  role: GarmentRole
  view: PhotoView
  viewName: string
  image: T
  color: string
}

export type PlannedImage<T> = {
  color: string
  shot: Shot
  inputs: PlannedInput<T>[]
  /** "photo": made from this colour's own photo of this shot. "borrowed": the shot's design
   * comes from another colour. "guessed": no colour has this shot; the AI invents it. */
  basis: "photo" | "borrowed" | "guessed"
  /** For "borrowed": the colour whose photo gives the design. */
  from?: string
}

/**
 * Which photos make each image: every colour gets every shot. A shot the colour has a photo of
 * is made from that photo; a missing shot uses the colour's other photos for colour and
 * material, plus the first other colour that has that shot for the design.
 */
export function planShoot<T>(
  colors: { name: string; photos: { view: PhotoView; image: T }[] }[],
  shots: Shot[],
): PlannedImage<T>[] {
  const nameOf = (key: string) => shotName(shots, key)
  const of = (c: (typeof colors)[number], key: string) =>
    c.photos.filter((p) => p.view === key).slice(0, MAX_PER_SIDE)

  return colors.flatMap((color) =>
    shots.map((shot): PlannedImage<T> => {
      const same = of(color, shot.key)
      if (same.length) {
        return {
          color: color.name,
          shot,
          basis: "photo",
          inputs: same.map((p) => ({
            role: "garment",
            view: shot.key,
            viewName: shot.name,
            image: p.image,
            color: color.name,
          })),
        }
      }
      const own = color.photos.slice(0, MAX_OTHER_SHOTS).map((p) => ({
        role: "colour" as const,
        view: p.view,
        viewName: nameOf(p.view),
        image: p.image,
        color: color.name,
      }))
      const donor = colors.find((c) => c !== color && of(c, shot.key).length)
      if (!donor) return { color: color.name, shot, basis: "guessed", inputs: own }
      const design = of(donor, shot.key)[0]
      return {
        color: color.name,
        shot,
        basis: "borrowed",
        from: donor.name,
        inputs: [
          ...own,
          {
            role: "design",
            view: shot.key,
            viewName: shot.name,
            image: design.image,
            color: donor.name,
          },
        ],
      }
    }),
  )
}
