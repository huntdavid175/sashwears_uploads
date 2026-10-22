import type { Metadata } from "next"

import { Templates } from "@/components/templates/templates"

export const metadata: Metadata = { title: "Templates · Backdrop Studio" }

export default function TemplatesPage() {
  return <Templates />
}
