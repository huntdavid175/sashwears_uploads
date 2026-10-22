import type { Metadata } from "next"

import { ProductList } from "@/components/products/product-list"

export const metadata: Metadata = { title: "Products · Backdrop Studio" }

export default function ProductsPage() {
  return <ProductList />
}
