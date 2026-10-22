import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Template } from "@/lib/types"
import { storedImage, useTestDb } from "@/test/db"
import { pngHeader } from "@/test/fixtures"

const edit = vi.hoisted(() => ({
  fail: false,
  calls: [] as { size: string; view?: string }[],
  /** Shoot edits: how many images went in, and the prompt. */
  shootCalls: [] as { size: string; images: number; prompt: string }[],
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
    editImages: async (opts: { size: string; images: Buffer[]; prompt: string }) => {
      edit.shootCalls.push({ size: opts.size, images: opts.images.length, prompt: opts.prompt })
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

const {
  createCompletedDress,
  createShootFromPhotos,
  regeneratePhoto,
  regenerateShootImage,
  runNext,
  updateProduct,
} = await import("./queue")
const { getShoot } = await import("./store/shoots")
const { createProduct, getProduct } = await import("./store/products")
const { createTemplate, updateTemplate } = await import("./store/templates")

let db: Awaited<ReturnType<typeof useTestDb>>

beforeEach(async () => {
  db = await useTestDb()
  Object.assign(edit, { fail: false, calls: [], shootCalls: [] })
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
    { reference: storedImage() },
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

describe("sets", () => {
  const pose = () => storedImage(1024, 1536)

  async function startShoot(existing?: Template) {
    const template =
      existing ??
      (await createTemplate(
        { name: "Ama", prompt: "soft studio light", model: "gpt-image-2" },
        {
          shots: [
            { name: "Front", reference: pose() },
            { name: "Back", reference: pose() },
          ],
        },
      ))
    const shoot = await createShootFromPhotos({
      templateId: template.id,
      name: "Satin Wrap Midi Dress",
      description: "A wrap dress.",
      colors: [
        {
          name: "Black",
          photos: [
            { view: "front", image: storedImage(800, 1200) },
            { view: "back", image: storedImage(800, 1200) },
          ],
        },
        { name: "Wine Red", photos: [{ view: "front", image: storedImage(800, 1200) }] },
      ],
    })
    return { template, shoot }
  }

  it("puts every colour in every shot on the model, in the set's folder", async () => {
    const { template, shoot } = await startShoot()
    expect(template.kind).toBe("model")
    expect(shoot.status).toBe("generating")
    expect(shoot.colors.map((c) => c.images.map((i) => `${c.name} ${i.shotName}`))).toEqual([
      ["Black Front", "Black Back"],
      ["Wine Red Front", "Wine Red Back"],
    ])
    await drain()

    const done = await getShoot(shoot.id)
    expect(done.status).toBe("ready")
    expect(edit.calls).toEqual([])
    // Shot reference + product photos; Wine Red's back is its front + Black's back.
    expect(edit.shootCalls.map((c) => c.images)).toEqual([2, 2, 2, 3])
    expect(edit.shootCalls[3].prompt).toMatch(/Image 3 shows the Back view of the same product/)
    expect(edit.shootCalls[1].prompt).toMatch(/"Back" shot/)
    expect(edit.shootCalls[0].prompt).toMatch(/Image 1 is the MODEL/)
    expect(edit.shootCalls.every((c) => c.size === "1024x1536")).toBe(true)
    expect(ik.uploads.map((u) => `${u.folder}/${u.fileName}`)).toEqual([
      "/backdrop-studio/shoots/satin-wrap-midi-dress/satin-wrap-midi-dress-black-front.png",
      "/backdrop-studio/shoots/satin-wrap-midi-dress/satin-wrap-midi-dress-black-back.png",
      "/backdrop-studio/shoots/satin-wrap-midi-dress/satin-wrap-midi-dress-wine-red-front.png",
      "/backdrop-studio/shoots/satin-wrap-midi-dress/satin-wrap-midi-dress-wine-red-back.png",
    ])
    expect(done.colors[1].images[1].output?.filePath).toMatch(/wine-red-back\.png$/)

    // A second set with the same name gets its own folder.
    const { shoot: again } = await startShoot(template)
    expect(again.handle).toBe("satin-wrap-midi-dress-2")
  })

  it("places a bag in a scene template's own shots", async () => {
    const template = await createTemplate(
      { name: "Marble table", kind: "scene", prompt: "morning light" },
      {
        shots: ["Front", "Side", "Inside"].map((name) => ({
          name,
          reference: storedImage(1536, 1024),
        })),
      },
    )
    expect(template.shots.map((s) => s.key)).toEqual(["front", "side", "inside"])
    const shoot = await createShootFromPhotos({
      templateId: template.id,
      name: "Woven Raffia Tote Bag",
      description: "",
      colors: [
        {
          name: "Tan",
          photos: [
            { view: "front", image: storedImage() },
            { view: "inside", image: storedImage() },
          ],
        },
      ],
    })
    await drain()
    expect((await getShoot(shoot.id)).status).toBe("ready")
    expect(edit.shootCalls[0].prompt).toMatch(/Image 1 is the SCENE/)
    expect(edit.shootCalls[0].prompt).toMatch(/Place this product in the scene/)
    // No colour has a side photo: made from Tan's own photos, guessed.
    expect(edit.shootCalls[1].images).toBe(3)
    expect(edit.shootCalls[0].size).toBe("1536x1024")
    expect(ik.uploads.map((u) => u.fileName)).toEqual([
      "woven-raffia-tote-bag-tan-front.png",
      "woven-raffia-tote-bag-tan-side.png",
      "woven-raffia-tote-bag-tan-inside.png",
    ])
  })

  it("redoes one image with the same photos and settings, replacing its file", async () => {
    edit.fail = true
    const { template, shoot } = await startShoot()
    await drain()
    expect((await getShoot(shoot.id)).status).toBe("attention")

    edit.fail = false
    // Later template edits don't change a set already made.
    await updateTemplate(template.id, { outputFormat: "webp" })
    const image = shoot.colors[0].images[0]
    await regenerateShootImage(shoot.id, image.id)
    await expect(regenerateShootImage(shoot.id, image.id)).rejects.toThrow(/already/)
    await drain()
    const redone = await getShoot(shoot.id)
    expect(redone.colors[0].images[0]).toMatchObject({ status: "done" })
    expect(redone.status).toBe("attention")
    expect(ik.uploads.at(-1)?.fileName).toBe("satin-wrap-midi-dress-black-front.png")
  })

  it("needs a template with shots; shot names must be unique", async () => {
    const background = await createTemplate(
      { name: "Beach", prompt: "p" },
      { reference: storedImage() },
    )
    await expect(
      createShootFromPhotos({
        templateId: background.id,
        name: "Dress",
        description: "",
        colors: [{ name: "Black", photos: [{ view: "front", image: storedImage() }] }],
      }),
    ).rejects.toThrow(/Add the shots/)
    await expect(createTemplate({ name: "Empty", prompt: "p" }, {})).rejects.toThrow(/shot/)
    await expect(
      createTemplate(
        { name: "Twice", prompt: "p" },
        {
          shots: [
            { name: "Front", reference: pose() },
            { name: "front ", reference: pose() },
          ],
        },
      ),
    ).rejects.toThrow(/twice/)
  })
})
