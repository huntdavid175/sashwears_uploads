import { describe, expect, it } from "vitest"

import { jpegHeader, pngHeader, webpHeader } from "@/test/fixtures"

import { readImageInfo } from "./image"

describe("readImageInfo", () => {
  it("reads PNG dimensions", () => {
    expect(readImageInfo(pngHeader(800, 1200))).toEqual({ format: "png", width: 800, height: 1200 })
  })

  it("reads JPEG dimensions past leading segments", () => {
    expect(readImageInfo(jpegHeader(1920, 1080))).toEqual({
      format: "jpeg",
      width: 1920,
      height: 1080,
    })
  })

  it("reads extended WebP dimensions", () => {
    expect(readImageInfo(webpHeader(1024, 1536))).toEqual({
      format: "webp",
      width: 1024,
      height: 1536,
    })
  })

  it("rejects non-images", () => {
    expect(readImageInfo(Buffer.from("GIF89a-not-supported-here-at-all"))).toBeNull()
    expect(readImageInfo(Buffer.alloc(0))).toBeNull()
  })
})
