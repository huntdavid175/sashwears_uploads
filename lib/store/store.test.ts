import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { storedImage, useTestDb } from "@/test/db"

import { addJobs, claimNextJob, failStaleJobs, getJob, newJob, STALE_MESSAGE } from "./jobs"
import {
  createProduct,
  deleteProduct,
  getProduct,
  listProducts,
  nameProductOnce,
  planHandle,
  type NewProductInput,
} from "./products"
import {
  createTemplate,
  deleteTemplate,
  getDefaultTemplate,
  getTemplate,
  listTemplates,
  setDefaultTemplate,
  slugify,
  updateTemplate,
} from "./templates"

let db: Awaited<ReturnType<typeof useTestDb>>

beforeEach(async () => {
  db = await useTestDb()
})

afterEach(async () => {
  await db.close()
})

const ref = () => storedImage(1024, 1024)

describe("templates", () => {
  it("creates with defaults, slug and reference; the first one is the default", async () => {
    const reference = ref()
    const t = await createTemplate({ name: "Beach Day", prompt: "sunny" }, { reference })
    expect(t).toMatchObject({
      name: "Beach Day",
      slug: "beach-day",
      model: "gpt-image-2",
      quality: "high",
      outputFormat: "png",
      reference,
      isDefault: true,
    })
    expect(await getTemplate(t.id)).toEqual(t)
    const second = await createTemplate({ name: "Studio", prompt: "p" }, { reference: ref() })
    expect(second.isDefault).toBe(false)
  })

  it("enforces required fields and case-insensitive unique names", async () => {
    await expect(createTemplate({ name: " ", prompt: "p" }, { reference: ref() })).rejects.toThrow(
      /Name/,
    )
    await expect(createTemplate({ name: "A", prompt: "" }, { reference: ref() })).rejects.toThrow(
      /Prompt/,
    )
    await createTemplate({ name: "Studio", prompt: "p" }, { reference: ref() })
    await expect(
      createTemplate({ name: "studio ", prompt: "p" }, { reference: ref() }),
    ).rejects.toMatchObject({
      code: "conflict",
    })
  })

  it("rejects unknown models and unsupported qualities", async () => {
    await expect(
      createTemplate({ name: "X", prompt: "p", model: "dall-e" as never }, { reference: ref() }),
    ).rejects.toThrow(/Unknown model/)
    await expect(
      createTemplate(
        { name: "X", prompt: "p", model: "gpt-image-2", quality: "max" },
        { reference: ref() },
      ),
    ).rejects.toThrow(/doesn't support/)
  })

  it("updates fields, keeps its own name, swaps the reference, unique slugs", async () => {
    const t = await createTemplate({ name: "Studio", prompt: "p" }, { reference: ref() })
    const next = ref()
    const u = await updateTemplate(t.id, { name: "studio", prompt: "new" }, { reference: next })
    expect(u).toMatchObject({ name: "studio", slug: "studio", prompt: "new", reference: next })
    const other = await createTemplate({ name: "Other", prompt: "p" }, { reference: ref() })
    expect((await updateTemplate(other.id, { name: "Studio!" })).slug).toBe("studio-2")
  })

  it("switches the default, falls back after deleting it, and errors with none", async () => {
    await expect(getDefaultTemplate()).rejects.toThrow(/Templates/)
    const a = await createTemplate({ name: "A", prompt: "p" }, { reference: ref() })
    const b = await createTemplate({ name: "B", prompt: "p" }, { reference: ref() })
    expect((await getDefaultTemplate()).id).toBe(a.id)
    await setDefaultTemplate(b.id)
    expect((await getDefaultTemplate()).id).toBe(b.id)
    expect((await listTemplates()).map((t) => t.isDefault)).toEqual([true, false])
    await deleteTemplate(b.id)
    expect((await getDefaultTemplate()).id).toBe(a.id)
  })

  it("slugifies safely", () => {
    expect(slugify("Café Noir — Été!")).toBe("cafe-noir-ete")
    expect(slugify("***")).toBe("template")
    expect(slugify("***", "dress")).toBe("dress")
  })
})

function dress(colors = 2): NewProductInput {
  return {
    price: 450,
    sizes: ["S", "M", "L"],
    colors: Array.from({ length: colors }, (_, i) => ({
      name: ["Black", "Wine", "Emerald"][i],
      quantities: { S: 1, M: 2, L: 0 },
      photos: [
        { view: "front" as const, source: storedImage(), originalName: `${i}-front.jpg` },
        ...(i === 0
          ? [{ view: "back" as const, source: storedImage(), originalName: "0-back.jpg" }]
          : []),
      ],
    })),
  }
}

describe("products", () => {
  it("saves a dress with colours, photos and one queued job per photo", async () => {
    const t = await createTemplate({ name: "Studio", prompt: "p" }, { reference: ref() })
    const { product, jobs } = await createProduct(dress(3), t)

    expect(product).toMatchObject({ price: 450, sizes: ["S", "M", "L"], status: "generating" })
    expect(product.name).toBeUndefined()
    expect(product.colors.map((c) => c.name)).toEqual(["Black", "Wine", "Emerald"])
    expect(product.colors.map((c) => c.photos.map((p) => p.view))).toEqual([
      ["front", "back"],
      ["front"],
      ["front"],
    ])
    expect(product.colors[0].quantities).toEqual({ S: 1, M: 2, L: 0 })
    expect(jobs).toHaveLength(4)
    const job = await getJob(jobs[1].id)
    expect(job).toMatchObject({ status: "queued", photoId: product.colors[0].photos[1].id })
    expect((await listProducts()).map((p) => p.id)).toEqual([product.id])
  })

  it("names once, with unique handles, and plans renames", async () => {
    const t = await createTemplate({ name: "Studio", prompt: "p" }, { reference: ref() })
    const a = (await createProduct(dress(1), t)).product
    const b = (await createProduct(dress(1), t)).product

    expect((await nameProductOnce(a.id, "Wrap Dress")).handle).toBe("wrap-dress")
    expect((await nameProductOnce(a.id, "Other Name")).name).toBe("Wrap Dress") // already named
    expect((await nameProductOnce(b.id, "Wrap Dress")).handle).toBe("wrap-dress-2")

    const named = await getProduct(a.id)
    expect(await planHandle(named, "wrap dress!")).toBe("wrap-dress")
    expect(await planHandle(named, "Maxi Dress")).toBe("maxi-dress")
  })

  it("derives status from the latest job of each photo", async () => {
    const t = await createTemplate({ name: "Studio", prompt: "p" }, { reference: ref() })
    const { product } = await createProduct(dress(1), t)
    await db.pg.query("UPDATE jobs SET status = 'done'")
    expect((await getProduct(product.id)).status).toBe("ready")

    // A newer failed job for one photo (e.g. a regenerate) wins over the old done one.
    const photo = product.colors[0].photos[0]
    await addJobs([
      { ...newJob(t, { originalName: "x", source: photo.source, photoId: photo.id }) },
    ])
    await db.pg.query("UPDATE jobs SET status = 'failed', error = 'boom' WHERE status = 'queued'")
    const p = await getProduct(product.id)
    expect(p.status).toBe("attention")
    expect(p.colors[0].photos[0]).toMatchObject({ status: "failed", error: "boom" })
  })

  it("deletes a dress with its colours, photos and jobs", async () => {
    const t = await createTemplate({ name: "Studio", prompt: "p" }, { reference: ref() })
    const { product } = await createProduct(dress(2), t)
    const photos = await deleteProduct(product.id)
    expect(photos).toHaveLength(3)
    expect(await listProducts()).toEqual([])
    expect((await db.pg.query("SELECT * FROM jobs")).rows).toEqual([])
    expect((await db.pg.query("SELECT * FROM product_photos")).rows).toEqual([])
  })
})

describe("jobs", () => {
  it("claims oldest first, never more than the limit at once", async () => {
    const t = await createTemplate({ name: "Studio", prompt: "p" }, { reference: ref() })
    const jobs = [1, 2, 3].map((i) =>
      newJob(t, { originalName: `${i}.png`, source: storedImage() }),
    )
    jobs.forEach((j, i) => (j.createdAt = new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString()))
    await addJobs(jobs)

    const claimed = await Promise.all([claimNextJob(2), claimNextJob(2), claimNextJob(2)])
    const ids = claimed.filter(Boolean).map((j) => j!.id)
    expect(ids.length).toBeLessThanOrEqual(2)
    expect(ids).toContain(jobs[0].id)
    expect(await claimNextJob(2)).toBeNull()
    expect((await getJob(jobs[0].id)).attempts).toBe(1)
  })

  it("fails jobs stuck in processing past the timeout", async () => {
    const t = await createTemplate({ name: "Studio", prompt: "p" }, { reference: ref() })
    const job = newJob(t, { originalName: "a.png", source: storedImage() })
    await addJobs([job])
    await claimNextJob(2)
    expect(await failStaleJobs()).toBe(0)
    await db.pg.query("UPDATE jobs SET started_at = now() - interval '10 minutes'")
    expect(await failStaleJobs()).toBe(1)
    expect(await getJob(job.id)).toMatchObject({ status: "failed", error: STALE_MESSAGE })
  })
})
