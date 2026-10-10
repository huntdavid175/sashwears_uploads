import type { Metadata } from "next"

import { TemplateSettings } from "@/components/settings/templates"

export const metadata: Metadata = { title: "Settings · Backdrop Studio" }

export default function SettingsPage() {
  return <TemplateSettings />
}
