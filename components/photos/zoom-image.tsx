"use client"

import { useState } from "react"

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { imageUrl } from "@/lib/client"
import type { StoredImage } from "@/lib/types"

/** A preview that opens the whole image, at full size, when clicked. */
export function ZoomImage({
  image,
  alt,
  width,
  className,
}: {
  image: StoredImage
  alt: string
  /** The preview's width in pixels. */
  width: number
  className?: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`View ${alt} in full`}
        title={alt}
        className="block size-full cursor-zoom-in outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- ImageKit resizes it */}
        <img src={imageUrl(image, { width })} alt={alt} className={className} />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-auto max-w-[calc(100vw-2rem)] gap-2 p-2 sm:max-w-[calc(100vw-2rem)]">
          <DialogTitle className="px-1 pr-8 text-sm">{alt}</DialogTitle>
          {/* Mounted only while open: the full file isn't fetched until it's asked for. */}
          {open && (
            // eslint-disable-next-line @next/next/no-img-element -- the original, not resized
            <img
              src={imageUrl(image)}
              alt={alt}
              className="max-h-[calc(100dvh-5.5rem)] w-auto rounded-sm object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
