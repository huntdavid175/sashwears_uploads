export class StoreError extends Error {
  constructor(
    public code: "invalid" | "not_found" | "conflict",
    message: string,
  ) {
    super(message)
    this.name = "StoreError"
  }
}
