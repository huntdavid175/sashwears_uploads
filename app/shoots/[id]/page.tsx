import type { Metadata } from "next"
import { Suspense } from "react"

import { ShootResult } from "@/components/shoots/shoot-result"

export const metadata: Metadata = { title: "On model · Backdrop Studio" }

export default function ShootPage() {
  // ShootResult reads the id with useParams, which needs a Suspense boundary here.
  return (
    <Suspense>
      <ShootResult />
    </Suspense>
  )
}
