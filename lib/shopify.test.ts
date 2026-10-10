import { describe, expect, it } from "vitest"

import { storedImage } from "@/test/db"

import { SHOPIFY_COLUMNS, toShopifyCsv } from "./shopify"
import type { Product, ProductPhoto } from "./types"

function photo(view: "front" | "back", name: string): ProductPhoto {
  return {
    id: `${name}-${view}`,
    colorId: name,
    view,
    source: storedImage(),
    output: {
      ...storedImage(1024, 1536, `wrap-${name}-${view}.png`),
      url: `https://ik.imagekit.io/demo/wrap-${name}-${view}.png`,
    },
    status: "done",
  }
}

const product: Product = {
  id: "p1",
  name: 'Satin "Wrap" Dress',
  handle: "satin-wrap-dress",
  price: 450,
  sizes: ["S", "M"],
  createdAt: "",
  updatedAt: "",
  status: "ready",
  colors: [
    {
      id: "black",
      name: "Black",
      position: 0,
      quantities: { S: 2, M: 3 },
      photos: [photo("front", "black"), photo("back", "black")],
    },
    {
      id: "wine",
      name: "Wine, Red",
      position: 1,
      quantities: { S: 0, M: 1 },
      photos: [photo("front", "wine")],
    },
  ],
}

/** Minimal CSV parser for the test (handles quotes, commas, doubled quotes). */
function parse(csv: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  const text = csv.replace(/^\uFEFF/, "")
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ",") {
      row.push(cell)
      cell = ""
    } else if (ch === "\n") {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ""
    } else if (ch !== "\r") cell += ch
  }
  return rows
}

describe("toShopifyCsv", () => {
  const rows = parse(toShopifyCsv([product]))
  const header = rows[0]
  const get = (r: string[], col: (typeof SHOPIFY_COLUMNS)[number]) => r[header.indexOf(col)]
  const body = rows.slice(1)

  it("writes Shopify's header and one row per colour × size", () => {
    expect(header).toEqual([...SHOPIFY_COLUMNS])
    expect(body).toHaveLength(4)
    expect(body.map((r) => [get(r, "Option1 value"), get(r, "Option2 value")])).toEqual([
      ["Black", "S"],
      ["Black", "M"],
      ["Wine, Red", "S"],
      ["Wine, Red", "M"],
    ])
    expect(body.map((r) => get(r, "Inventory quantity"))).toEqual(["2", "3", "0", "1"])
    expect(body.every((r) => get(r, "Price") === "450.00")).toBe(true)
    expect(body.every((r) => get(r, "URL handle") === "satin-wrap-dress")).toBe(true)
  })

  it("puts product fields and option names on the first row only, as a draft", () => {
    expect(get(body[0], "Title")).toBe('Satin "Wrap" Dress')
    expect(get(body[0], "Status")).toBe("draft")
    expect([get(body[0], "Option1 name"), get(body[0], "Option2 name")]).toEqual(["Color", "Size"])
    expect(get(body[1], "Title")).toBe("")
    expect(get(body[1], "Option1 name")).toBe("")
  })

  it("lists every photo as a product image and each colour's front as its variant image", () => {
    expect(body.map((r) => get(r, "Image position"))).toEqual(["1", "2", "3", ""])
    expect(get(body[1], "Product image URL")).toContain("wrap-black-back.png?tr=orig-true")
    expect(get(body[3], "Variant image URL")).toContain("wrap-wine-front.png")
    expect(get(body[0], "Variant image URL")).toContain("wrap-black-front.png")
  })

  it("adds image-only rows when there are more photos than variants", () => {
    const one = { ...product, sizes: ["S"], colors: [product.colors[0]] }
    const r = parse(toShopifyCsv([one])).slice(1)
    expect(r).toHaveLength(2)
    expect(get(r[1], "Option1 value")).toBe("")
    expect(get(r[1], "Image position")).toBe("2")
  })

  it("refuses dresses that aren't ready", () => {
    expect(() => toShopifyCsv([{ ...product, status: "generating" }])).toThrow(/generating/)
    expect(() => toShopifyCsv([{ ...product, name: undefined }])).toThrow(/named/)
  })
})
