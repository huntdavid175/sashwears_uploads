import { describe, expect, it } from "vitest"

import { normalizeQuantities, ONE_SIZE } from "@/lib/dress"

import { toStock } from "./details"

const colors = { all: ["Red", "Green", "Blue", "Wine"], finished: ["Red", "Green", "Blue"] }
const entry = (color: string, size: string, quantity: number) => ({ color, size, quantity })

describe("reading the stock", () => {
  it("arranges colours and sizes, in size order, whatever order they were written", () => {
    const stock = toStock(
      {
        entries: [entry("Red", "small", 3), entry("Green", "medium", 3), entry("Blue", "s", 5)],
        unknownColors: [],
      },
      colors,
    )
    expect(stock.sizes).toEqual(["S", "M"])
    expect(stock.quantities).toEqual({ Red: { S: 3 }, Green: { M: 3 }, Blue: { S: 5 } })
  })

  it("adds up repeats and keeps sizes it doesn't know as written", () => {
    const stock = toStock(
      {
        entries: [entry("Red", "38", 1), entry("Red", "38", 2), entry("Red", "XL", 4)],
        unknownColors: [],
      },
      colors,
    )
    expect(stock.sizes).toEqual(["XL", "38"])
    expect(stock.quantities.Red).toEqual({ 38: 3, XL: 4 })
  })

  it("reads a one-size product", () => {
    const stock = toStock(
      { entries: [entry("Red", "", 3), entry("Blue", "", 2)], unknownColors: [] },
      colors,
    )
    expect(stock.sizes).toEqual([])
    expect(stock.quantities).toEqual({ Red: { [ONE_SIZE]: 3 }, Blue: { [ONE_SIZE]: 2 } })
    expect(normalizeQuantities(stock.quantities.Red, stock.sizes)).toEqual({ [ONE_SIZE]: 3 })
  })

  it("drops a colour with no images, and refuses one the product doesn't have", () => {
    expect(toStock({ entries: [entry("Wine", "M", 2)], unknownColors: [] }, colors).sizes).toEqual(
      [],
    )
    expect(() => toStock({ entries: [], unknownColors: ["yellow"] }, colors)).toThrow(
      /No Yellow here\. Its colours are Red, Green, Blue, Wine/i,
    )
  })

  it("refuses a mix of sized and unsized stock", () => {
    expect(() =>
      toStock({ entries: [entry("Red", "", 3), entry("Blue", "S", 2)], unknownColors: [] }, colors),
    ).toThrow(/Say which size Red is/)
  })
})
