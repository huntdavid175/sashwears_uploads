/** Dress input rules shared by the API (validation) and the UI (forms, formatting). */

/** Currency for prices. Set NEXT_PUBLIC_CURRENCY (ISO code, e.g. "GHS") to change it. */
export const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY || "USD"

export const DEFAULT_SIZES = ["S", "M", "L", "XL", "XXL"]
export const MAX_SIZES = 20
export const MAX_COLORS = 20
/** Photos in one finished-dress upload (front + back of up to 20 colours). */
export const MAX_COMPLETED_PHOTOS = 40
const MAX_LABEL = 40

function label(value: unknown, what: string) {
  if (typeof value !== "string") throw new Error(`${what} must be text`)
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_LABEL)
}

/** Trimmed, no blanks, no case-insensitive repeats, at least one. */
export function normalizeSizes(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("Sizes must be a list")
  const seen = new Set<string>()
  const sizes: string[] = []
  for (const item of value) {
    const size = label(item, "Sizes")
    if (!size || seen.has(size.toLowerCase())) continue
    seen.add(size.toLowerCase())
    sizes.push(size)
  }
  if (!sizes.length) throw new Error("Pick at least one size")
  if (sizes.length > MAX_SIZES) throw new Error(`Up to ${MAX_SIZES} sizes`)
  return sizes
}

export function normalizeColorName(value: unknown): string {
  const name = label(value, "Colour name")
  if (!name) throw new Error("Every colour needs a name")
  return name
}

/** Whole numbers ≥ 0 for each of `sizes`; anything else is dropped. Blank counts as 0. */
export function normalizeQuantities(value: unknown, sizes: string[]): Record<string, number> {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  const out: Record<string, number> = {}
  for (const size of sizes) {
    const raw = input[size]
    const n = raw === undefined || raw === null || raw === "" ? 0 : Number(raw)
    if (!Number.isInteger(n) || n < 0 || n > 1_000_000) {
      throw new Error(`Quantity for ${size} must be a whole number of 0 or more`)
    }
    out[size] = n
  }
  return out
}

/** A non-negative amount, rounded to cents. */
export function parsePrice(value: unknown): number {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/[\s,]/g, ""))
  if (value === "" || value == null || !Number.isFinite(n) || n < 0 || n >= 1e10) {
    throw new Error("Enter a price of 0 or more")
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

export function totalStock(quantities: Record<string, number>, sizes: string[]) {
  return sizes.reduce((sum, s) => sum + (quantities[s] ?? 0), 0)
}
