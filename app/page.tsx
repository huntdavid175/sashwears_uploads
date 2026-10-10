import { Suspense } from "react"

import { Studio } from "@/components/studio/studio"

export default function Home() {
  return (
    // Studio reads the selected template from the URL, which needs a Suspense boundary.
    <Suspense>
      <Studio />
    </Suspense>
  )
}
