import type { Metadata } from "next"
import { Suspense } from "react"

import { DressDetail } from "@/components/dresses/dress-detail"

export const metadata: Metadata = { title: "Dress · Backdrop Studio" }

export default function DressPage() {
  // DressDetail reads the id with useParams, which needs a Suspense boundary here.
  return (
    <Suspense>
      <DressDetail />
    </Suspense>
  )
}
