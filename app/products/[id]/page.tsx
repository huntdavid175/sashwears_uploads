import type { Metadata } from "next"
import { Suspense } from "react"

import { ProductDetail } from "@/components/products/product-detail"

export const metadata: Metadata = { title: "Product · Backdrop Studio" }

export default function ProductPage() {
  // ProductDetail reads the id with useParams, which needs a Suspense boundary here.
  return (
    <Suspense>
      <ProductDetail />
    </Suspense>
  )
}
