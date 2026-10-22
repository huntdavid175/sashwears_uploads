/** Product input rules shared by the API (validation) and the UI (forms, formatting). */

/** Currency for prices: Ghana cedis. NEXT_PUBLIC_CURRENCY (ISO code) overrides it. */
export const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY || "GHS"

// Fixed locale + narrow symbol: "GH₵450.00" everywhere (the default locale shows "GHS 450.00"),
// and server and browser format identically.
const money = (() => {
  try {
    return new Intl.NumberFormat("en-GH", {
      style: "currency",
      currency: CURRENCY,
      currencyDisplay: "narrowSymbol",
    })
  } catch {
    return null
  }
})()

/** The currency's symbol for labels, e.g. "GH₵". */
export const CURRENCY_SYMBOL =
  money?.formatToParts(0).find((p) => p.type === "currency")?.value ?? CURRENCY

export const DEFAULT_SIZES = ["S", "M", "L", "XL", "XXL"]
export const MAX_SIZES = 20
export const MAX_COLORS = 20
/** Photos in one finished-product upload. */
export const MAX_COMPLETED_PHOTOS = 40

/** Stock key for products without sizes (bags, one-size items). */
export const ONE_SIZE = "One size"

/** The sizes stock is counted in: the product's sizes, or ONE_SIZE when it has none. */
export function stockSizes(sizes: string[]) {
  return sizes.length ? sizes : [ONE_SIZE]
}
const MAX_LABEL = 40

function label(value: unknown, what: string) {
  if (typeof value !== "string") throw new Error(`${what} must be text`)
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_LABEL)
}

/** Trimmed, no blanks, no case-insensitive repeats. None means one size. */
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
  if (sizes.length > MAX_SIZES) throw new Error(`Up to ${MAX_SIZES} sizes`)
  return sizes
}

/** "Dress", "Tote bag"…; empty when unknown. */
export function normalizeProductType(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, MAX_LABEL) : ""
}

export function normalizeColorName(value: unknown): string {
  const name = label(value, "Colour name")
  if (!name) throw new Error("Every colour needs a name")
  return name
}

/** Whole numbers ≥ 0 for each stock size (`stockSizes`); the rest is dropped. Blank is 0. */
export function normalizeQuantities(value: unknown, sizes: string[]): Record<string, number> {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  const out: Record<string, number> = {}
  for (const size of stockSizes(sizes)) {
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
  return money ? money.format(amount) : `${CURRENCY} ${amount.toFixed(2)}`
}

export function totalStock(quantities: Record<string, number>, sizes: string[]) {
  return stockSizes(sizes).reduce((sum, s) => sum + (quantities[s] ?? 0), 0)
}
