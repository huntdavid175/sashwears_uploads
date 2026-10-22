import "server-only"

import path from "node:path"

import { MIME_BY_FORMAT, readImageInfo } from "@/lib/image"

import { getClient } from "./edit"

/** Vision model that names products. Override with OPENAI_NAMING_MODEL. */
export const NAMING_MODEL = process.env.OPENAI_NAMING_MODEL || "gpt-5.4-mini"

const NAMING_PROMPT = [
  "Name the main product in this photo (clothing, a bag, shoes or an accessory) for an online",
  "catalog. It is sold in several colors, so do NOT mention any color.",
  "Use 2 to 5 words in Title Case: material or pattern, then style, ending with the product",
  'type, e.g. "Satin Wrap Midi Dress" or "Woven Raffia Tote Bag".',
  "Describe only what is visible. No brand names, quotes, emoji or punctuation.",
  "Reply with the name only.",
].join(" ")

const MAX_NAME = 80

/**
 * Ask the vision model for a product name from the source photo. Never throws: falls back to
 * a name made from the uploaded file name, so a naming hiccup doesn't fail an expensive edit.
 */
export async function nameProduct(data: Buffer, originalName: string): Promise<string> {
  try {
    const info = readImageInfo(data)
    if (!info) throw new Error("unreadable image")
    const res = await getClient().responses.create({
      model: NAMING_MODEL,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: NAMING_PROMPT },
            {
              type: "input_image",
              detail: "low",
              image_url: `data:${MIME_BY_FORMAT[info.format]};base64,${data.toString("base64")}`,
            },
          ],
        },
      ],
    })
    const name = cleanName(res.output_text)
    if (!name) throw new Error("empty name")
    return name
  } catch (err) {
    console.warn(`[name] falling back to file name for ${originalName}:`, (err as Error).message)
    return fallbackName(originalName)
  }
}

/** Trim model output to a single plain line. Exported for the rename endpoint too. */
export function cleanName(raw: string) {
  return raw
    .split("\n")[0]
    .replace(/["“”'`*_#]/g, "")
    .replace(/[.!?:;]+$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME)
    .trim()
}

function fallbackName(originalName: string) {
  const stem = path.parse(originalName).name.replace(/[-_]+/g, " ")
  // Camera names ("IMG 1234", "PXL 2026…") make poor product names.
  if (!stem || /^(img|dsc|pxl|photo|image)\b|^\d/i.test(stem)) return "Untitled Dress"
  return cleanName(stem.replace(/\b\w/g, (c) => c.toUpperCase())) || "Untitled Dress"
}
