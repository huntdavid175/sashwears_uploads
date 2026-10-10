/** Minimal PNG header (signature + IHDR) — enough for format/dimension sniffing. */
export function pngHeader(width: number, height: number) {
  const buf = Buffer.alloc(33)
  buf.writeUInt32BE(0x89504e47, 0)
  buf.writeUInt32BE(0x0d0a1a0a, 4)
  buf.writeUInt32BE(13, 8)
  buf.write("IHDR", 12, "ascii")
  buf.writeUInt32BE(width, 16)
  buf.writeUInt32BE(height, 20)
  return buf
}

/** Minimal JPEG: SOI, an APP0 segment, then SOF0 with dimensions. */
export function jpegHeader(width: number, height: number) {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x04, 0x00, 0x00])
  const sof = Buffer.alloc(11)
  sof.writeUInt8(0xff, 0)
  sof.writeUInt8(0xc0, 1)
  sof.writeUInt16BE(9, 2)
  sof.writeUInt8(8, 4)
  sof.writeUInt16BE(height, 5)
  sof.writeUInt16BE(width, 7)
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof])
}

/** Minimal extended WebP (VP8X) header. */
export function webpHeader(width: number, height: number) {
  const buf = Buffer.alloc(30)
  buf.write("RIFF", 0, "ascii")
  buf.writeUInt32LE(22, 4)
  buf.write("WEBP", 8, "ascii")
  buf.write("VP8X", 12, "ascii")
  buf.writeUIntLE(width - 1, 24, 3)
  buf.writeUIntLE(height - 1, 27, 3)
  return buf
}
