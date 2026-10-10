import { describe, expect, it } from "vitest"

import { estimateCost } from "./models"
import { pickSize } from "./size"

function parse(size: string) {
  const [w, h] = size.split("x").map(Number)
  return { w, h }
}

describe("pickSize — fixed-size models", () => {
  it.each([
    [800, 1200, "1024x1536"],
    [1200, 800, "1536x1024"],
    [1000, 1000, "1024x1024"],
    [1000, 1100, "1024x1024"],
    [3000, 1000, "1536x1024"],
  ])("%ix%i → %s", (w, h, expected) => {
    expect(pickSize("gpt-image-1.5", w, h)).toBe(expected)
  })
})

describe("pickSize — flexible models", () => {
  it("keeps the source aspect ratio", () => {
    const { w, h } = parse(pickSize("gpt-image-2", 2000, 3000))
    expect(w / h).toBeCloseTo(2 / 3, 1)
  })

  it("returns multiples of 16 within limits", () => {
    for (const [sw, sh] of [
      [4000, 6000],
      [640, 480],
      [5000, 1000],
      [300, 3000],
      [1080, 1350],
    ]) {
      const { w, h } = parse(pickSize("gpt-image-2", sw, sh))
      expect(w % 16).toBe(0)
      expect(h % 16).toBe(0)
      expect(Math.max(w, h)).toBeLessThanOrEqual(2560)
      expect(w / h).toBeLessThanOrEqual(3)
      expect(h / w).toBeLessThanOrEqual(3)
      expect(w * h).toBeGreaterThanOrEqual(1024 * 1024)
    }
  })

  it("clamps extreme ratios to 3:1", () => {
    const { w, h } = parse(pickSize("gpt-image-2", 6000, 1000))
    expect(w / h).toBeCloseTo(3, 1)
  })

  it("upscales small sources to ~1MP and caps large ones", () => {
    const small = parse(pickSize("gpt-image-2", 500, 500))
    const large = parse(pickSize("gpt-image-2", 6000, 6000))
    expect(small).toEqual({ w: 1024, h: 1024 })
    expect(large).toEqual({ w: 1536, h: 1536 })
  })
})

describe("estimateCost", () => {
  it("matches published gpt-image-1.5 high 1024² output price within input overhead", () => {
    const cost = estimateCost("gpt-image-1.5", "high", "1024x1024")
    expect(cost).toBeGreaterThan(0.133)
    expect(cost).toBeLessThan(0.2)
  })

  it("scales with size and quality", () => {
    expect(estimateCost("gpt-image-2", "high", "1536x1536")).toBeGreaterThan(
      estimateCost("gpt-image-2", "high", "1024x1024"),
    )
    expect(estimateCost("gpt-image-2", "low", "1024x1024")).toBeLessThan(
      estimateCost("gpt-image-2", "high", "1024x1024"),
    )
  })
})
