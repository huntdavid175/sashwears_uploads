import type { Metadata } from "next"

import { DressList } from "@/components/dresses/dress-list"

export const metadata: Metadata = { title: "Dresses · Backdrop Studio" }

export default function DressesPage() {
  return <DressList />
}
