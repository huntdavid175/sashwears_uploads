import { describe, expect, it } from "vitest"

import { normalizeColorName, normalizeQuantities, normalizeSizes, parsePrice } from "./dress"

describe("dress input", () => {
  it("normalizes sizes: trims, drops blanks and repeats, keeps order", () => {
    expect(normalizeSizes([" S", "m", "M", "", "XL "])).toEqual(["S", "m", "XL"])
    expect(() => normalizeSizes([])).toThrow(/at least one/)
    expect(() => normalizeSizes("S")).toThrow(/list/)
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
