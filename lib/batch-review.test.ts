import { describe, expect, it } from "vitest"

import {
  leaveOutPhoto,
  mergeProducts,
  movePhotoTo,
  newColorIn,
  NEW_PRODUCT,
  type ProductGroup,
} from "./batch-review"
import type { SortedPhoto } from "./client"

const photo = (fileId: string) => ({ fileId }) as SortedPhoto

function start(): ProductGroup[] {
  return [
    {
      key: "dress",
      name: "Satin Dress",
      description: "",
      groups: [
        { key: "black", name: "Black", photos: [photo("a"), photo("b")] },
        { key: "wine", name: "Wine", photos: [photo("c")] },
      ],
    },
    {
      key: "shirt",
      name: "",
      description: "Linen.",
      groups: [
        { key: "black2", name: "black", photos: [photo("d")] },
        { key: "white", name: "White", photos: [photo("e")] },
      ],
    },
  ]
}

const shape = (list: ProductGroup[]) =>
  list.map((p) => ({
    name: p.name,
    colors: p.groups.map((g) => `${g.name}:${g.photos.map((x) => x.fileId).join("")}`),
  }))

let n = 0
const newKey = () => `n${++n}`

describe("fixing the sort", () => {
  it("moves a photo between products; emptied colours and products disappear", () => {
    expect(shape(movePhotoTo(start(), "c", "white", newKey))).toEqual([
      { name: "Satin Dress", colors: ["Black:ab"] },
      { name: "", colors: ["black:d", "White:ec"] },
    ])
    const one = [{ ...start()[0], groups: [{ key: "g", name: "Red", photos: [photo("a")] }] }]
    expect(shape(movePhotoTo([...one, start()[1]], "a", "white", newKey))).toEqual([
      { name: "", colors: ["black:d", "White:ea"] },
    ])
  })

  it("splits a photo into a new colour or a new product that keeps its colour", () => {
    expect(shape(movePhotoTo(start(), "a", newColorIn("shirt"), newKey))[1].colors).toEqual([
      "black:d",
      "White:e",
      ":a",
    ])
    expect(shape(movePhotoTo(start(), "a", NEW_PRODUCT, newKey))[2]).toEqual({
      name: "",
      colors: ["Black:a"],
    })
  })

  it("merges products, joining a shared colour and keeping the words it has", () => {
    const [merged, ...rest] = mergeProducts(start(), "shirt", "dress")
    expect(rest).toEqual([])
    expect(shape([merged])).toEqual([
      { name: "Satin Dress", colors: ["Black:abd", "Wine:c", "White:e"] },
    ])
    expect(merged.description).toBe("Linen.")
    expect(mergeProducts(start(), "dress", "shirt")[0].name).toBe("Satin Dress")
  })

  it("leaves a photo out", () => {
    expect(shape(leaveOutPhoto(start(), "c"))[0].colors).toEqual(["Black:ab"])
  })
})
