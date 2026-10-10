export type ImageInfo = {
  format: "png" | "jpeg" | "webp"
  width: number
  height: number
}

export const MIME_BY_FORMAT = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
} as const

/** Sniff format + dimensions from file bytes. Returns null for anything we don't accept. */
export function readImageInfo(buf: Buffer): ImageInfo | null {
  // PNG: signature, then IHDR width/height at bytes 16..24
  if (
    buf.length >= 24 &&
    buf.readUInt32BE(0) === 0x89504e47 &&
    buf.readUInt32BE(4) === 0x0d0a1a0a
  ) {
    return { format: "png", width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
  }

  // JPEG: walk segments until a Start Of Frame marker
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) return null
      const marker = buf[i + 1]
      if (marker === 0xff) {
        i++ // fill byte
        continue
      }
      const len = buf.readUInt16BE(i + 2)
      const isSof =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
      if (isSof) {
        return { format: "jpeg", height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) }
      }
      i += 2 + len
    }
    return null
  }

  // WebP: RIFF....WEBP + VP8 / VP8L / VP8X chunk
  if (
    buf.length >= 30 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    const chunk = buf.toString("ascii", 12, 16)
    if (chunk === "VP8 ") {
      return {
        format: "webp",
        width: buf.readUInt16LE(26) & 0x3fff,
        height: buf.readUInt16LE(28) & 0x3fff,
      }
    }
    if (chunk === "VP8L") {
      const bits = buf.readUInt32LE(21)
      return { format: "webp", width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
    }
    if (chunk === "VP8X") {
      return { format: "webp", width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 }
    }
  }

  return null
}

export function extForFormat(format: ImageInfo["format"]) {
  return format === "jpeg" ? "jpg" : format
}
