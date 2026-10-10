import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { storedImage } from "@/test/db"
import { pngHeader } from "@/test/fixtures"

/** Every call the code makes to the ImageKit SDK, in order. */
const sdk = vi.hoisted(() => ({ calls: [] as string[], failUpload: false }))

vi.mock("@imagekit/nodejs", async (importOriginal) => {
  const real = await importOriginal<typeof import("@imagekit/nodejs")>()
  class FakeImageKit {
    files = {
      upload: async (p: { folder: string; fileName: string; overwriteFile: boolean }) => {
        sdk.calls.push(`upload ${p.folder}/${p.fileName} overwrite=${p.overwriteFile}`)
        if (sdk.failUpload) throw new Error("upload failed")
        const filePath = `${p.folder}/${p.fileName}`
        return {
          fileId: `new:${filePath}`,
          filePath,
          url: `https://ik.imagekit.io/demo${filePath}`,
        }
      },
      delete: async (id: string) => void sdk.calls.push(`delete ${id}`),
      move: async () => void sdk.calls.push("move"),
      rename: async () => void sdk.calls.push("rename"),
    }
    cache = {
      invalidation: { create: async (p: { url: string }) => void sdk.calls.push(`purge ${p.url}`) },
    }
  }
  return { ...real, default: FakeImageKit }
})

const { putImage, relocateImage, ReplacedError } = await import("./imagekit")

beforeEach(() => {
  process.env.IMAGEKIT_PRIVATE_KEY = "test"
  Object.assign(sdk, { calls: [], failUpload: false })
  vi.stubGlobal("fetch", async () => new Response(new Uint8Array(pngHeader(800, 1200))))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const data = pngHeader(1024, 1536)
const existing = (filePath: string) => ({
  ...storedImage(),
  fileId: "old",
  filePath,
  url: `https://ik.imagekit.io/demo${filePath}`,
})

// The account has no file versions, so overwrite / move / rename must never be used.
describe("ImageKit without file versions", () => {
  it("replaces a file at the same path by delete → upload → purge", async () => {
    const out = await putImage({
      data,
      folder: "/f",
      fileName: "a.png",
      previous: existing("/f/a.png"),
    })
    expect(sdk.calls).toEqual([
      "delete old",
      "upload /f/a.png overwrite=false",
      "purge https://ik.imagekit.io/demo/f/a.png",
    ])
    expect(out.filePath).toBe("/f/a.png")
  })

  it("replaces a file at another path by upload → delete", async () => {
    await putImage({ data, folder: "/f", fileName: "a.webp", previous: existing("/f/a.png") })
    expect(sdk.calls).toEqual(["upload /f/a.webp overwrite=false", "delete old"])
  })

  it("reports when the old file is gone but the new upload failed", async () => {
    sdk.failUpload = true
    await expect(
      putImage({ data, folder: "/f", fileName: "a.png", previous: existing("/f/a.png") }),
    ).rejects.toBeInstanceOf(ReplacedError)
    await expect(
      putImage({ data, folder: "/f", fileName: "b.png", previous: existing("/f/a.png") }),
    ).rejects.not.toBeInstanceOf(ReplacedError)
  })

  it("moves/renames by re-uploading the original and deleting the old file", async () => {
    const out = await relocateImage(
      existing("/_sources/IMG_1.png"),
      "/dresses/x",
      "x-black-front.png",
    )
    expect(sdk.calls).toEqual(["upload /dresses/x/x-black-front.png overwrite=false", "delete old"])
    expect(out.filePath).toBe("/dresses/x/x-black-front.png")

    sdk.calls = []
    const same = existing("/dresses/x/x-black-front.png")
    expect(await relocateImage(same, "/dresses/x", "x-black-front.png")).toBe(same)
    expect(sdk.calls).toEqual([])
  })
})
