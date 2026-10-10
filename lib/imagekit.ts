import "server-only"

import ImageKit, { APIConnectionError, APIError, toFile } from "@imagekit/nodejs"

import { readImageInfo } from "@/lib/image"
import { StoreError } from "@/lib/store/errors"
import type { StoredImage } from "@/lib/types"

let client: ImageKit | undefined

export class UploadError extends Error {
  name = "UploadError"
}

function getClient() {
  if (!process.env.IMAGEKIT_PRIVATE_KEY) {
    throw new UploadError(
      "IMAGEKIT_PRIVATE_KEY is not set. Add it to the environment and redeploy.",
    )
  }
  // Reads IMAGEKIT_PRIVATE_KEY itself.
  client ??= new ImageKit({ maxRetries: 2 })
  return client
}

function root() {
  return (process.env.IMAGEKIT_FOLDER || "backdrop-studio").replace(/^\/+|\/+$/g, "")
}

/** Results: one subfolder per template. */
export function imagekitFolder(templateSlug: string) {
  return `/${root()}/${templateSlug}`
}

/** Where the browser uploads originals ("sources") and template backgrounds ("references"). */
export function uploadFolder(kind: "sources" | "references") {
  return `/${root()}/_${kind}`
}

/** One-time signature letting the browser upload one file straight to ImageKit. */
export function uploadAuth(kind: "sources" | "references") {
  const publicKey = process.env.IMAGEKIT_PUBLIC_KEY
  if (!publicKey) throw new UploadError("IMAGEKIT_PUBLIC_KEY is not set.")
  return {
    ...getClient().helper.getAuthenticationParameters(),
    publicKey,
    folder: uploadFolder(kind),
  }
}

const ACCEPTED_MIME = ["image/png", "image/jpeg", "image/webp"]

/** Look up a file the browser uploaded and check it's an image we can edit. */
export async function getStoredImage(fileId: string): Promise<StoredImage> {
  let file
  try {
    file = await getClient().files.get(fileId)
  } catch (err) {
    if (err instanceof APIError && err.status === 404) {
      throw new StoreError("invalid", "Uploaded image not found on ImageKit")
    }
    throw toUploadError(err)
  }
  if (!file.mime || !ACCEPTED_MIME.includes(file.mime)) {
    throw new StoreError("invalid", `${file.name ?? "File"} is not a PNG, JPEG or WebP image`)
  }
  if (!file.fileId || !file.filePath || !file.url || !file.width || !file.height) {
    throw new UploadError("ImageKit returned incomplete file details")
  }
  return {
    fileId: file.fileId,
    filePath: file.filePath,
    url: file.url,
    width: file.width,
    height: file.height,
    updatedAt: new Date().toISOString(),
  }
}

/** Original bytes (no ImageKit optimisation) for sending to OpenAI. */
export async function downloadImage(image: StoredImage): Promise<Buffer> {
  const url = new URL(image.url)
  url.searchParams.set("tr", "orig-true")
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) throw new UploadError(`Couldn't download ${image.filePath} (HTTP ${res.status})`)
  const data = Buffer.from(await res.arrayBuffer())
  if (!readImageInfo(data)) throw new UploadError(`${image.filePath} is not a PNG, JPEG or WebP`)
  return data
}

/**
 * Upload at an exact path, never adding a random suffix. `replace` overwrites an existing
 * file there (and purges the CDN so the same URL serves the new image); without it an
 * existing file makes the upload fail instead of being clobbered.
 */
export async function uploadImage(opts: {
  data: Buffer
  folder: string
  fileName: string
  replace: boolean
}): Promise<StoredImage> {
  const ik = getClient()
  const info = readImageInfo(opts.data)
  if (!info) throw new UploadError("Generated image is not a PNG, JPEG or WebP")
  try {
    const res = await ik.files.upload({
      file: await toFile(opts.data, opts.fileName),
      fileName: opts.fileName,
      folder: opts.folder,
      useUniqueFileName: false,
      overwriteFile: opts.replace,
    })
    if (!res.fileId || !res.filePath || !res.url) {
      throw new UploadError("ImageKit returned an incomplete upload response")
    }
    if (opts.replace) {
      await ik.cache.invalidation
        .create({ url: res.url })
        .catch((err) => console.warn("[imagekit] cache purge failed:", toUploadError(err).message))
    }
    return {
      fileId: res.fileId,
      filePath: res.filePath,
      url: res.url,
      width: info.width,
      height: info.height,
      updatedAt: new Date().toISOString(),
    }
  } catch (err) {
    throw toUploadError(err)
  }
}

/** Rename in place (purging the old URL). Returns the file's new path and URL. */
export async function renameImage(file: StoredImage, newFileName: string): Promise<StoredImage> {
  try {
    await getClient().files.rename({ filePath: file.filePath, newFileName, purgeCache: true })
  } catch (err) {
    throw toUploadError(err)
  }
  const url = new URL(file.url)
  url.pathname = url.pathname.replace(/[^/]+$/, encodeURIComponent(newFileName))
  url.search = ""
  return {
    ...file,
    filePath: file.filePath.replace(/[^/]+$/, newFileName),
    url: url.toString(),
    updatedAt: new Date().toISOString(),
  }
}

export async function deleteImage(fileId: string) {
  try {
    await getClient().files.delete(fileId)
  } catch (err) {
    throw toUploadError(err)
  }
}

export function toUploadError(err: unknown): UploadError {
  if (err instanceof UploadError) return err
  if (err instanceof APIConnectionError) {
    return new UploadError("Couldn't reach ImageKit (network error or timeout). Retry.")
  }
  if (err instanceof APIError) {
    const detail =
      err.error && typeof err.error === "object" && "message" in err.error
        ? String((err.error as { message: unknown }).message)
        : err.message
    if (err.status === 401 || err.status === 403) {
      return new UploadError(`ImageKit rejected the key. Check IMAGEKIT_PRIVATE_KEY: ${detail}`)
    }
    return new UploadError(`ImageKit error ${err.status ?? ""}: ${detail}`.trim())
  }
  return new UploadError(err instanceof Error ? err.message : String(err))
}
