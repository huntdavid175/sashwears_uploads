/** Dress details shared by the API (validation) and the UI (formatting). */

export const MAX_COLORS = 20
const MAX_COLOR_LENGTH = 40

/** Currency for prices. Set NEXT_PUBLIC_CURRENCY (ISO code, e.g. "GHS") to change it. */
export const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY || "USD"

/** Accepts a list or a comma-separated string; trims, drops blanks and case-insensitive repeats. */
export function normalizeColors(value: unknown): string[] {
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : null
  if (!list) throw new Error("Colors must be a list")
  const seen = new Set<string>()
  const colors: string[] = []
  for (const item of list) {
    if (typeof item !== "string") throw new Error("Colors must be text")
    const color = item.replace(/\s+/g, " ").trim().slice(0, MAX_COLOR_LENGTH)
    if (!color || seen.has(color.toLowerCase())) continue
    seen.add(color.toLowerCase())
    colors.push(color)
  }
  if (colors.length > MAX_COLORS) throw new Error(`Up to ${MAX_COLORS} colors`)
  return colors
}

/** Blank → no price. Otherwise a non-negative amount, rounded to cents. */
export function parsePrice(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const n = typeof value === "number" ? value : Number(String(value).replace(/[\s,]/g, ""))
  if (!Number.isFinite(n) || n < 0 || n >= 1e10) {
    throw new Error("Price must be a number of 0 or more")
  }
  return Math.round(n * 100) / 100
}

export function formatPrice(amount: number) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: CURRENCY }).format(
      amount,
    )
  } catch {
    return `${CURRENCY} ${amount.toFixed(2)}`
  }
}
