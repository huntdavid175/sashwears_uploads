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
  moves: [] as { filePath: string; folder: string }[],
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
    // `replace`: a same-path re-upload (the real one deletes the old file first).
    putImage: async (opts: {
      folder: string
      fileName: string
      previous?: { filePath: string; fileId: string }
    }) => {
      const path = `${opts.folder}/${opts.fileName}`
      const replace = opts.previous?.filePath === path
      ik.uploads.push({ folder: opts.folder, fileName: opts.fileName, replace })
      if (opts.previous && !replace) ik.deletes.push(opts.previous.fileId)
      return file(path)
    },
    // Re-upload under a new name (and maybe folder), recorded as a rename (+ move).
    relocateImage: async (f: { filePath: string }, folder: string, fileName: string) => {
      const target = `${folder}/${fileName}`
      if (f.filePath === target) return f
      ik.renames.push({ filePath: f.filePath, newFileName: fileName })
      if (!f.filePath.startsWith(`${folder}/`)) ik.moves.push({ filePath: f.filePath, folder })
      return file(target)
    },
    deleteImage: async (fileId: string) => {
      ik.deletes.push(fileId)
    },
  }
})

const { createCompletedDress, regeneratePhoto, runNext, updateProduct } = await import("./queue")
const { createProduct, getProduct } = await import("./store/products")
const { createTemplate, updateTemplate } = await import("./store/templates")

let db: Awaited<ReturnType<typeof useTestDb>>

beforeEach(async () => {
  db = await useTestDb()
  Object.assign(edit, { fail: false, calls: [] })
  Object.assign(naming, { name: "Satin Wrap Midi Dress", calls: 0 })
  Object.assign(ik, { uploads: [], renames: [], moves: [], deletes: [] })
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
      "/backdrop-studio/dresses/satin-wrap-midi-dress/satin-wrap-midi-dress-black-front.png",
      "/backdrop-studio/dresses/satin-wrap-midi-dress/satin-wrap-midi-dress-black-back.png",
      "/backdrop-studio/dresses/satin-wrap-midi-dress/satin-wrap-midi-dress-wine-red-front.png",
    ])
    expect(done.colors[1].photos[0].output?.filePath).toBe(
      "/backdrop-studio/dresses/satin-wrap-midi-dress/satin-wrap-midi-dress-wine-red-front.png",
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
      "id:/backdrop-studio/dresses/satin-wrap-midi-dress/satin-wrap-midi-dress-wine-red-front.png",
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
      "/backdrop-studio/dresses/ruched-maxi-dress/ruched-maxi-dress-burgundy-front.png",
    )

    // Nothing to rename when only stock changes.
    ik.renames = []
    await updateProduct(product.id, {
      colors: [{ id: black.id, name: "Black", quantities: { S: 0, M: 0 } }],
    })
    expect(ik.renames).toEqual([])
    await expect(updateProduct(product.id, { name: "  " })).rejects.toThrow(/empty/)
  })

  it("renaming the dress moves its files into the new dress folder", async () => {
    const { product } = await submitDress()
    await drain()
    await updateProduct(product.id, { name: "Ruched Maxi Dress" })
    expect(ik.moves.map((m) => m.folder)).toEqual(
      Array(3).fill("/backdrop-studio/dresses/ruched-maxi-dress"),
    )
  })
})

describe("completed dresses", () => {
  const finished = (name: string) => ({
    ...storedImage(1024, 1536, name),
    filePath: `/backdrop-studio/_sources/${name}`,
  })

  it("files finished photos in the dress folder, named, with no edits", async () => {
    const product = await createCompletedDress({
      name: "Satin Wrap Midi Dress",
      price: 300,
      sizes: ["S", "M"],
      colors: [
        {
          name: "Black",
          quantities: { S: 1, M: 1 },
          photos: [
            { view: "front", image: finished("IMG_1.JPG") },
            { view: "back", image: finished("IMG_2.JPG") },
          ],
        },
        {
          name: "Wine",
          quantities: { S: 0, M: 2 },
          photos: [{ view: "front", image: finished("IMG_3.jpg") }],
        },
      ],
    })

    expect(product).toMatchObject({
      kind: "completed",
      status: "ready",
      handle: "satin-wrap-midi-dress",
    })
    expect(edit.calls).toEqual([])
    expect(ik.renames.map((r) => r.newFileName)).toEqual([
      "satin-wrap-midi-dress-black-front.jpg",
      "satin-wrap-midi-dress-black-back.jpg",
      "satin-wrap-midi-dress-wine-front.jpg",
    ])
    const back = product.colors[0].photos[1]
    expect(back.output?.filePath).toBe(
      "/backdrop-studio/dresses/satin-wrap-midi-dress/satin-wrap-midi-dress-black-back.jpg",
    )
    expect(back.source).toEqual(back.output)
    expect(await runNext()).toBe(false)
    await expect(regeneratePhoto(product.id, back.id)).rejects.toThrow(/already edited/)

    // Renaming a colour renames its file; source follows (same file).
    const renamed = await updateProduct(product.id, {
      colors: [{ id: product.colors[1].id, name: "Burgundy", quantities: { S: 0, M: 2 } }],
    })
    const wine = renamed.colors[1].photos[0]
    expect(wine.output?.filePath).toMatch(/satin-wrap-midi-dress-burgundy-front\.jpg$/)
    expect(wine.source).toEqual(wine.output)
  })
})
