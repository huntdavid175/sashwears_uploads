import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { storedImage, useTestDb } from "@/test/db"

import {
  addJobs,
  claimNextJob,
  createDress,
  failStaleJobs,
  getJob,
  listJobs,
  newJob,
  planDressFileName,
  requeueJob,
  saveDress,
  STALE_MESSAGE,
} from "./jobs"
import {
  createTemplate,
  deleteTemplate,
  duplicateTemplate,
  getTemplate,
  listTemplates,
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
  it("creates with defaults, slug and reference", async () => {
    const reference = ref()
    const t = await createTemplate({ name: "Beach Day", prompt: "sunny" }, reference)
    expect(t).toMatchObject({
      name: "Beach Day",
      slug: "beach-day",
      model: "gpt-image-2",
      quality: "high",
      outputFormat: "png",
      reference,
    })
    expect(await getTemplate(t.id)).toEqual(t)
  })

  it("enforces required fields and case-insensitive unique names", async () => {
    await expect(createTemplate({ name: " ", prompt: "p" }, ref())).rejects.toThrow(/Name/)
    await expect(createTemplate({ name: "A", prompt: "" }, ref())).rejects.toThrow(/Prompt/)
    await createTemplate({ name: "Studio", prompt: "p" }, ref())
    await expect(createTemplate({ name: "studio ", prompt: "p" }, ref())).rejects.toMatchObject({
      code: "conflict",
    })
  })

  it("rejects unknown models and unsupported qualities", async () => {
    await expect(
      createTemplate({ name: "X", prompt: "p", model: "dall-e" as never }, ref()),
    ).rejects.toThrow(/Unknown model/)
    await expect(
      createTemplate({ name: "X", prompt: "p", model: "gpt-image-2", quality: "max" }, ref()),
    ).rejects.toThrow(/doesn't support/)
  })

  it("updates fields, keeps its own name, and swaps the reference", async () => {
    const t = await createTemplate({ name: "Studio", prompt: "p" }, ref())
    const next = ref()
    const u = await updateTemplate(t.id, { name: "studio", prompt: "new" }, next)
    expect(u).toMatchObject({ name: "studio", slug: "studio", prompt: "new", reference: next })
  })

  it("gives renamed templates unique slugs", async () => {
    await createTemplate({ name: "Beach", prompt: "p" }, ref())
    const t = await createTemplate({ name: "Other", prompt: "p" }, ref())
    expect((await updateTemplate(t.id, { name: "Beach!" })).slug).toBe("beach-2")
  })

  it("duplicates with a unique copy name and the same reference", async () => {
    const t = await createTemplate({ name: "Studio", prompt: "p" }, ref())
    const a = await duplicateTemplate(t.id)
    const b = await duplicateTemplate(t.id)
    expect([a.name, b.name]).toEqual(["Studio (copy)", "Studio (copy 2)"])
    expect(a.reference).toEqual(t.reference)
  })

  it("deletes, and treats bad ids as not found", async () => {
    const t = await createTemplate({ name: "Studio", prompt: "p" }, ref())
    await deleteTemplate(t.id)
    expect(await listTemplates()).toEqual([])
    await expect(getTemplate("nope")).rejects.toMatchObject({ code: "not_found" })
  })

  it("slugifies safely", () => {
    expect(slugify("Café Noir — Été!")).toBe("cafe-noir-ete")
    expect(slugify("***")).toBe("template")
    expect(slugify("***", "dress")).toBe("dress")
  })
})

describe("jobs", () => {
  it("snapshots the template so later edits don't change queued jobs", async () => {
    const t = await createTemplate({ name: "Studio", prompt: "old" }, ref())
    const job = newJob(t, { originalName: "a.png", source: storedImage() })
    await addJobs([job])
    await updateTemplate(t.id, { prompt: "new" })
    const saved = await getJob(job.id)
    expect(saved.templateSnapshot.prompt).toBe("old")
    expect(saved).toMatchObject({ status: "queued", attempts: 0, source: job.source })
    expect(await listJobs({ templateId: t.id })).toHaveLength(1)
  })

  it("claims oldest first, never more than the limit at once", async () => {
    const t = await createTemplate({ name: "Studio", prompt: "p" }, ref())
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

  it("fails jobs stuck in processing past the timeout, then they can be retried", async () => {
    const t = await createTemplate({ name: "Studio", prompt: "p" }, ref())
    const job = newJob(t, { originalName: "a.png", source: storedImage() })
    await addJobs([job])
    await claimNextJob(2)
    expect(await failStaleJobs()).toBe(0)
    await db.pg.query("UPDATE jobs SET started_at = now() - interval '10 minutes'")
    expect(await failStaleJobs()).toBe(1)
    expect(await getJob(job.id)).toMatchObject({ status: "failed", error: STALE_MESSAGE })

    expect((await requeueJob(job.id)).status).toBe("queued")
    await expect(requeueJob(job.id)).rejects.toThrow(/Only failed/)
  })
})

describe("dresses", () => {
  it("gives each dress a unique file name", async () => {
    const names = await Promise.all([1, 2, 3].map(() => createDress("Red Silk Slip Dress")))
    expect(names.map((d) => d.fileName).sort()).toEqual([
      "red-silk-slip-dress",
      "red-silk-slip-dress-2",
      "red-silk-slip-dress-3",
    ])
  })

  it("plans rename file names: unchanged base keeps it, taken ones get a suffix", async () => {
    const a = await createDress("Blue Dress")
    const b = await createDress("Green Dress")
    expect(await planDressFileName(a, "blue dress!")).toBe("blue-dress")
    expect(await planDressFileName(a, "Green Dress")).toBe("green-dress-2")
    await saveDress(b.id, { name: "Teal Dress", fileName: "teal-dress" })
    expect(await planDressFileName(a, "Green Dress")).toBe("green-dress")
  })
})
