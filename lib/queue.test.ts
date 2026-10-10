import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { storedImage, useTestDb } from "@/test/db"
import { pngHeader } from "@/test/fixtures"

const edit = vi.hoisted(() => ({
  fail: false,
  calls: [] as { size: string; view?: string }[],
}))

vi.mock("@/lib/openai/edit", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/openai/edit")>()
  return {
    ...real,
    editImage: async (opts: { size: string; view?: string }) => {
      edit.calls.push({ size: opts.size, view: opts.view })
      if (edit.fail) throw new real.EditError("boom")
      return pngHeader(1024, 1536)
    },
  }
})

const naming = vi.hoisted(() => ({ name: "Satin Wrap Midi Dress", calls: 0 }))

vi.mock("@/lib/openai/name", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/openai/name")>()
  return {
    ...real,
    nameProduct: async () => {
      naming.calls++
      return naming.name
    },
  }
})

const ik = vi.hoisted(() => ({
  uploads: [] as { folder: string; fileName: string; replace: boolean }[],
  renames: [] as { filePath: string; newFileName: string }[],
  deletes: [] as string[],
}))

vi.mock("@/lib/imagekit", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/imagekit")>()
  const file = (filePath: string) => ({
    fileId: `id:${filePath}`,
    filePath,
    url: `https://ik.imagekit.io/demo${filePath}`,
    width: 1024,
    height: 1536,
    updatedAt: new Date().toISOString(),
  })
  return {
    ...real,
    downloadImage: async () => pngHeader(800, 1200),
    uploadImage: async (opts: { folder: string; fileName: string; replace: boolean }) => {
      ik.uploads.push({ folder: opts.folder, fileName: opts.fileName, replace: opts.replace })
      return file(`${opts.folder}/${opts.fileName}`)
    },
    renameImage: async (f: { filePath: string }, newFileName: string) => {
      ik.renames.push({ filePath: f.filePath, newFileName })
      return file(f.filePath.replace(/[^/]+$/, newFileName))
    },
    deleteImage: async (fileId: string) => {
      ik.deletes.push(fileId)
    },
  }
})

const { regeneratePhoto, runNext, updateProduct } = await import("./queue")
const { createProduct, getProduct } = await import("./store/products")
const { createTemplate, updateTemplate } = await import("./store/templates")

let db: Awaited<ReturnType<typeof useTestDb>>

beforeEach(async () => {
  db = await useTestDb()
  Object.assign(edit, { fail: false, calls: [] })
  Object.assign(naming, { name: "Satin Wrap Midi Dress", calls: 0 })
  Object.assign(ik, { uploads: [], renames: [], deletes: [] })
})

afterEach(async () => {
  await db.close()
})

/** Run queued jobs the way chained worker invocations would, until none are left. */
async function drain() {
  while (await runNext()) {}
}

async function submitDress() {
  const template = await createTemplate(
    { name: "Studio", prompt: "p", model: "gpt-image-1.5" },
    storedImage(),
  )
  const photo = (view: "front" | "back") => ({
    view,
    source: storedImage(800, 1200),
    originalName: `${view}.jpg`,
  })
  const { product } = await createProduct(
    {
      price: 450,
      sizes: ["S", "M"],
      colors: [
        { name: "Black", quantities: { S: 1, M: 2 }, photos: [photo("front"), photo("back")] },
        { name: "Wine Red", quantities: { S: 0, M: 3 }, photos: [photo("front")] },
      ],
    },
    template,
  )
  return { template, product }
}

describe("dress generation", () => {
  it("edits every photo, names the dress once, and uploads <dress>-<colour>-<view>", async () => {
    const { product } = await submitDress()
    await drain()

    const done = await getProduct(product.id)
    expect(done).toMatchObject({ name: "Satin Wrap Midi Dress", handle: "satin-wrap-midi-dress" })
    expect(done.status).toBe("ready")
    expect(naming.calls).toBe(1)
    expect(edit.calls.map((c) => c.view)).toEqual(["front", "back", "front"])
    expect(edit.calls.every((c) => c.size === "1024x1536")).toBe(true)
    expect(ik.uploads.map((u) => `${u.folder}/${u.fileName}`)).toEqual([
      "/backdrop-studio/products/satin-wrap-midi-dress-black-front.png",
      "/backdrop-studio/products/satin-wrap-midi-dress-black-back.png",
      "/backdrop-studio/products/satin-wrap-midi-dress-wine-red-front.png",
    ])
    expect(done.colors[1].photos[0].output?.filePath).toBe(
      "/backdrop-studio/products/satin-wrap-midi-dress-wine-red-front.png",
    )
  })

  it("marks failures; regenerating a photo replaces its file", async () => {
    edit.fail = true
    const { product } = await submitDress()
    await drain()
    expect((await getProduct(product.id)).status).toBe("attention")

    edit.fail = false
    const photo = product.colors[0].photos[0]
    await regeneratePhoto(product.id, photo.id)
    await expect(regeneratePhoto(product.id, photo.id)).rejects.toThrow(/already/)
    await drain()
    // The other two photos are still failed.
    expect((await getProduct(product.id)).colors[0].photos[0].status).toBe("done")

    await regeneratePhoto(product.id, photo.id)
    await drain()
    expect(ik.uploads.at(-1)).toMatchObject({
      fileName: "satin-wrap-midi-dress-black-front.png",
      replace: true,
    })
    expect(ik.deletes).toEqual([])
  })

  it("a new output format writes a new file and deletes the old one", async () => {
    const { template, product } = await submitDress()
    await drain()
    await updateTemplate(template.id, { outputFormat: "webp" })
    await regeneratePhoto(product.id, product.colors[1].photos[0].id)
    await drain()

    expect(ik.uploads.at(-1)).toMatchObject({
      fileName: "satin-wrap-midi-dress-wine-red-front.webp",
      replace: false,
    })
    expect(ik.deletes).toEqual([
      "id:/backdrop-studio/products/satin-wrap-midi-dress-wine-red-front.png",
    ])
  })

  it("renaming the dress or a colour renames the files", async () => {
    const { product } = await submitDress()
    await drain()
    const [black, wine] = (await getProduct(product.id)).colors

    const updated = await updateProduct(product.id, {
      name: "Ruched Maxi Dress",
      price: 500,
      colors: [
        { id: black.id, name: "Black", quantities: { S: 4, M: 4 } },
        { id: wine.id, name: "Burgundy", quantities: { S: 0, M: 3 } },
      ],
    })
    expect(updated).toMatchObject({
      name: "Ruched Maxi Dress",
      handle: "ruched-maxi-dress",
      price: 500,
    })
    expect(updated.colors[0].quantities).toEqual({ S: 4, M: 4 })
    expect(ik.renames.map((r) => r.newFileName)).toEqual([
      "ruched-maxi-dress-black-front.png",
      "ruched-maxi-dress-black-back.png",
      "ruched-maxi-dress-burgundy-front.png",
    ])
    expect(updated.colors[1].photos[0].output?.filePath).toBe(
      "/backdrop-studio/products/ruched-maxi-dress-burgundy-front.png",
    )

    // Nothing to rename when only stock changes.
    ik.renames = []
    await updateProduct(product.id, {
      colors: [{ id: black.id, name: "Black", quantities: { S: 0, M: 0 } }],
    })
    expect(ik.renames).toEqual([])
    await expect(updateProduct(product.id, { name: "  " })).rejects.toThrow(/empty/)
  })
})
