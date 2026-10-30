import type { Metadata } from "next"
import { Suspense } from "react"

import { BatchResult } from "@/components/shoots/shoot-result"

export const metadata: Metadata = { title: "Batch · Backdrop Studio" }

export default function BatchPage() {
  // BatchResult reads the id with useParams, which needs a Suspense boundary here.
  return (
    <Suspense>
      <BatchResult />
    </Suspense>
  )
}
