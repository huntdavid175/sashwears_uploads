import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { TemplateSettings } from "@/components/settings/templates"
import { SETTINGS_PAGE } from "@/lib/features"

export const metadata: Metadata = { title: "Settings · Backdrop Studio" }

export default function SettingsPage() {
  if (!SETTINGS_PAGE) notFound()
  return <TemplateSettings />
}
