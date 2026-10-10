import type { Metadata } from "next"
import { Suspense } from "react"

import { Studio } from "@/components/studio/studio"

export const metadata: Metadata = { title: "Studio · Backdrop Studio" }

export default function StudioPage() {
  return (
    // Studio reads the selected template from the URL, which needs a Suspense boundary.
    <Suspense>
      <Studio />
    </Suspense>
  )
}
