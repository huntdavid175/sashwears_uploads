import { describe, expect, it } from "vitest"

import {
  normalizeColorName,
  normalizeQuantities,
  normalizeSizes,
  ONE_SIZE,
  parsePrice,
  totalStock,
} from "./dress"

describe("dress input", () => {
  it("normalizes sizes: trims, drops blanks and repeats, keeps order", () => {
    expect(normalizeSizes([" S", "m", "M", "", "XL "])).toEqual(["S", "m", "XL"])
    // No sizes: a one-size product (a bag).
    expect(normalizeSizes([])).toEqual([])
    expect(() => normalizeSizes("S")).toThrow(/list/)
  })

  it("counts one-size stock under ONE_SIZE", () => {
    expect(normalizeQuantities({ [ONE_SIZE]: "4", S: 2 }, [])).toEqual({ [ONE_SIZE]: 4 })
    expect(totalStock({ [ONE_SIZE]: 4 }, [])).toBe(4)
  })

  it("requires colour names", () => {
    expect(normalizeColorName("  Wine   Red ")).toBe("Wine Red")
    expect(() => normalizeColorName(" ")).toThrow(/name/)
  })

  it("keeps quantities for the given sizes only; blank is 0", () => {
    expect(normalizeQuantities({ S: "2", M: "", L: 3, XS: 9 }, ["S", "M", "L"])).toEqual({
      S: 2,
      M: 0,
      L: 3,
    })
    expect(() => normalizeQuantities({ S: "1.5" }, ["S"])).toThrow(/whole number/)
    expect(() => normalizeQuantities({ S: -1 }, ["S"])).toThrow()
  })

  it("parses prices to cents and rejects blanks and negatives", () => {
    expect(parsePrice("1,250.456")).toBe(1250.46)
    expect(parsePrice(0)).toBe(0)
    expect(() => parsePrice("")).toThrow()
    expect(() => parsePrice("-5")).toThrow()
    expect(() => parsePrice("abc")).toThrow()
  })
})

describe("prices in cedis", () => {
  it("formats with the cedi symbol", async () => {
    const { formatPrice, CURRENCY_SYMBOL } = await import("./dress")
    expect(CURRENCY_SYMBOL).toBe("GH₵")
    expect(formatPrice(1250.5)).toBe("GH₵1,250.50")
  })
})
