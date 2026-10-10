"use client"

import { useState } from "react"

/** Drag to compare the original photo with the result. */
export function Compare({
  before,
  after,
  aspect,
}: {
  before: string
  after: string
  aspect: string
}) {
  const [split, setSplit] = useState(50)

  return (
    <div
      className="relative overflow-hidden rounded-md bg-muted select-none"
      style={{ aspectRatio: aspect }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- ImageKit resizes it */}
      <img src={after} alt="Result" className="absolute inset-0 size-full object-contain" />
      {/* eslint-disable-next-line @next/next/no-img-element -- ImageKit resizes it */}
      <img
        src={before}
        alt="Original"
        className="absolute inset-0 size-full bg-muted object-contain"
        style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-primary"
        style={{ left: `${split}%` }}
      >
        <span className="absolute top-1/2 left-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-card" />
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={split}
        onChange={(e) => setSplit(Number(e.target.value))}
        aria-label="Compare original and result"
        className="peer absolute inset-0 size-full cursor-ew-resize opacity-0"
      />
      <div className="pointer-events-none absolute inset-0 rounded-md ring-3 ring-ring/50 ring-inset opacity-0 peer-focus-visible:opacity-100" />
    </div>
  )
}
