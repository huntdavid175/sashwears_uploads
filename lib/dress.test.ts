import { describe, expect, it } from "vitest"

import { normalizeColors, parsePrice } from "./dress"

describe("normalizeColors", () => {
  it("accepts a list or comma-separated text, trims, and drops blanks and repeats", () => {
    expect(normalizeColors(" Black , emerald,, BLACK ,Wine ")).toEqual(["Black", "emerald", "Wine"])
    expect(normalizeColors(["Navy  Blue", " ", "navy blue"])).toEqual(["Navy Blue"])
  })

  it("rejects non-text and too many colors", () => {
    expect(() => normalizeColors(42)).toThrow(/list/)
    expect(() => normalizeColors([1])).toThrow(/text/)
    expect(() => normalizeColors(Array.from({ length: 21 }, (_, i) => `c${i}`))).toThrow(/20/)
  })
})

describe("parsePrice", () => {
  it("treats blank as no price and rounds to cents", () => {
    expect(parsePrice("")).toBeNull()
    expect(parsePrice(null)).toBeNull()
    expect(parsePrice("1,250.456")).toBe(1250.46)
    expect(parsePrice(0)).toBe(0)
  })

  it("rejects negatives and non-numbers", () => {
    expect(() => parsePrice("-5")).toThrow()
    expect(() => parsePrice("abc")).toThrow()
  })
})
