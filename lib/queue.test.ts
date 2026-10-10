import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { storedImage, useTestDb } from "@/test/db"
import { pngHeader } from "@/test/fixtures"

const edit = vi.hoisted(() => ({ fail: false, calls: [] as { size: string }[] }))

vi.mock("@/lib/openai/edit", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/openai/edit")>()
  return {
    ...real,
    editImage: async (opts: { size: string }) => {
      edit.calls.push({ size: opts.size })
      if (edit.fail) throw new real.EditError("boom")
      return pngHeader(1024, 1536)
    },
  }
})

const naming = vi.hoisted(() => ({ name: "Emerald Satin Wrap Dress", calls: 0 }))

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
  fail: false,
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
      if (ik.fail) throw new real.UploadError("ik down")
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

const { enqueue, regenerateJob, renameJob, retryJob, runNext } = await import("./queue")
const { getJob, listJobs, newJob } = await import("./store/jobs")
const { createTemplate, updateTemplate } = await import("./store/templates")

let db: Awaited<ReturnType<typeof useTestDb>>

beforeEach(async () => {
  db = await useTestDb()
  Object.assign(edit, { fail: false, calls: [] })
  Object.assign(naming, { name: "Emerald Satin Wrap Dress", calls: 0 })
  Object.assign(ik, { fail: false, uploads: [], renames: [], deletes: [] })
})

afterEach(async () => {
  await db.close()
})

/** Run queued jobs the way chained worker invocations would, until none are left. */
async function drain() {
  while (await runNext()) {}
}

async function queueJobs(n: number) {
  const t = await createTemplate(
    { name: "Studio", prompt: "p", model: "gpt-image-1.5" },
    storedImage()
  )
  const jobs = Array.from({ length: n }, (_, i) =>
    newJob(t, { originalName: `Dress ${i}.png`, source: storedImage(800, 1200) })
  )
  await enqueue(jobs)
  return { template: t, jobs }
}

describe("queue", () => {
  it("runs jobs: edits at the source's aspect, names each dress uniquely, uploads it", async () => {
    await queueJobs(3)
    await drain()

    const jobs = await listJobs()
    expect(jobs.map((j) => j.status)).toEqual(Array(3).fill("done"))
    expect(edit.calls.every((c) => c.size === "1024x1536")).toBe(true)
    expect(jobs.map((j) => j.name)).toEqual(Array(3).fill("Emerald Satin Wrap Dress"))
    expect(jobs.map((j) => j.fileName).sort()).toEqual([
      "emerald-satin-wrap-dress",
      "emerald-satin-wrap-dress-2",
      "emerald-satin-wrap-dress-3",
    ])
    expect(ik.uploads.every((u) => u.folder === "/backdrop-studio/studio" && !u.replace)).toBe(true)
    for (const j of jobs) {
      expect(j.output?.filePath).toBe(`/backdrop-studio/studio/${j.fileName}.png`)
      expect(j.attempts).toBe(1)
    }
  })

  it("records failures; retry re-runs without naming the dress twice", async () => {
    ik.fail = true
    const { jobs } = await queueJobs(1)
    await drain()
    expect(await getJob(jobs[0].id)).toMatchObject({ status: "failed", error: "ik down" })

    ik.fail = false
    await retryJob(jobs[0].id)
    await drain()
    expect(await getJob(jobs[0].id)).toMatchObject({ status: "done", attempts: 2 })
    expect(naming.calls).toBe(1)
  })

  it("regenerate keeps the dress and replaces the same ImageKit file", async () => {
    const { jobs } = await queueJobs(1)
    await drain()
    const fresh = await regenerateJob(jobs[0].id)
    await drain()

    expect(naming.calls).toBe(1)
    expect(await getJob(fresh.id)).toMatchObject({
      status: "done",
      name: "Emerald Satin Wrap Dress",
      fileName: "emerald-satin-wrap-dress",
    })
    expect(ik.uploads.at(-1)).toEqual({
      folder: "/backdrop-studio/studio",
      fileName: "emerald-satin-wrap-dress.png",
      replace: true,
    })
    expect(ik.deletes).toEqual([])
  })

  it("a new output format writes a new file and deletes the old one", async () => {
    const { template, jobs } = await queueJobs(1)
    await drain()
    await updateTemplate(template.id, { outputFormat: "webp" })
    await regenerateJob(jobs[0].id)
    await drain()

    expect(ik.uploads.at(-1)).toMatchObject({
      fileName: "emerald-satin-wrap-dress.webp",
      replace: false,
    })
    expect(ik.deletes).toEqual(["id:/backdrop-studio/studio/emerald-satin-wrap-dress.png"])
  })

  it("renames a dress and its ImageKit file", async () => {
    const { jobs } = await queueJobs(1)
    await drain()

    const renamed = await renameJob(jobs[0].id, "  Midnight Velvet Slip Dress ")
    expect(renamed).toMatchObject({
      name: "Midnight Velvet Slip Dress",
      fileName: "midnight-velvet-slip-dress",
    })
    expect(renamed.output?.filePath).toBe("/backdrop-studio/studio/midnight-velvet-slip-dress.png")
    expect(ik.renames).toEqual([
      {
        filePath: "/backdrop-studio/studio/emerald-satin-wrap-dress.png",
        newFileName: "midnight-velvet-slip-dress.png",
      },
    ])
    await expect(renameJob(jobs[0].id, "  ")).rejects.toThrow(/empty/)
  })
})
