import { describe, expect, it } from "vitest"

import { toBatchProducts } from "./classify"

const shots = [
  { key: "front", name: "Front" },
  { key: "back", name: "Back" },
]

const product = (name: string) => ({
  name,
  productType: "Dress",
  tags: ["Midi Dress", "satin"],
  description: "  A  dress. ",
})

describe("sorting a mixed upload", () => {
  it("groups photos by product and keeps each photo's position", () => {
    const products = toBatchProducts(
      {
        products: [product("Satin Dress"), product("Linen Shirt")],
        photos: [
          { photo: 1, product: 2, color: "White", view: "front" },
          { photo: 2, product: 1, color: "Black", view: "back" },
          { photo: 3, product: 2, color: "White", view: "back" },
        ],
      },
      3,
      shots,
    )
    expect(products.map((p) => p.name)).toEqual(["Satin Dress", "Linen Shirt"])
    expect(products[0].description).toBe("A dress.")
    expect(products[0].tags).toEqual(["midi-dress", "satin"])
    expect(products[1].photos).toEqual([
      { index: 0, color: "White", view: "front" },
      { index: 2, color: "White", view: "back" },
    ])
  })

  it("puts skipped or misplaced photos in an unnamed product, and drops empty products", () => {
    const products = toBatchProducts(
      {
        products: [product("Satin Dress"), product("Never Used")],
        photos: [
          { photo: 1, product: 1, color: "Black", view: "sideways" },
          { photo: 2, product: 9, color: "Red", view: "front" },
          { photo: 7, product: 1, color: "Ghost", view: "front" },
        ],
      },
      3,
      shots,
    )
    expect(products.map((p) => p.name)).toEqual(["Satin Dress", ""])
    expect(products[0].photos).toEqual([{ index: 0, color: "Black", view: "front" }])
    expect(products[1].photos).toEqual([
      { index: 1, color: "Red", view: "front" },
      { index: 2, color: "Unsorted", view: "front" },
    ])
  })
})
