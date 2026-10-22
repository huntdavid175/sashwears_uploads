"use client"

import { CheckCircle2Icon, LayersIcon } from "lucide-react"
import { useState } from "react"

import { Page, PageHeader } from "@/components/page"
import { ShootForm } from "@/components/shoots/shoot-form"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"

import { CompletedForm } from "./completed-form"

type Kind = "set" | "completed"

const KINDS: { value: Kind; label: string; help: string; icon: typeof LayersIcon }[] = [
  {
    value: "set",
    label: "Template set",
    help: "Raw photos → every colour in every shot of a template",
    icon: LayersIcon,
  },
  {
    value: "completed",
    label: "Completed product",
    help: "Photos already finished → a product for Shopify",
    icon: CheckCircle2Icon,
  },
]

const HELP: Record<Kind, string> = {
  set: "Pick a template, drop every photo of one product. The AI sorts them by colour and shot; you check, then it makes the whole set.",
  completed:
    "Drop every finished photo of one product and add the price. The AI sorts them by colour; nothing is edited.",
}

/** The owner's page: make a template set, or save a product whose photos are already done. */
export function UploadPage() {
  const [kind, setKind] = useState<Kind>("set")
  // Remounting the form (new key) after a save clears it without reset effects.
  const [formKey, setFormKey] = useState(0)
  // While a sort is being reviewed, switching type would throw the review away.
  const [reviewing, setReviewing] = useState(false)

  function saved() {
    setFormKey((k) => k + 1)
    setReviewing(false)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  return (
    <Page>
      <PageHeader title="Upload" description={reviewing ? undefined : HELP[kind]} />
      <div
        className={cn("grid items-start gap-4", !reviewing && "lg:grid-cols-[15rem_minmax(0,1fr)]")}
      >
        {!reviewing && (
          <Card size="sm" className="gap-0 py-0 lg:sticky lg:top-28">
            <CardHeader className="bg-primary py-2 text-primary-foreground">
              <CardTitle>What are you uploading?</CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              <ToggleGroup
                spacing={1}
                value={[kind]}
                onValueChange={(v) => {
                  if (!v[0]) return
                  setKind(v[0] as Kind)
                  setFormKey((k) => k + 1)
                }}
                aria-label="Upload type"
                className="grid w-full grid-cols-2 lg:grid-cols-1"
              >
                {KINDS.map(({ value, label, help, icon: Icon }) => (
                  <ToggleGroupItem
                    key={value}
                    value={value}
                    className="h-auto w-full flex-col items-start justify-start gap-0.5 px-2.5 py-2 text-left whitespace-normal"
                  >
                    <span className="flex items-center gap-1.5 font-semibold">
                      <Icon />
                      {label}
                    </span>
                    <span className="text-xs font-normal opacity-80">{help}</span>
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </CardContent>
          </Card>
        )}

        {kind === "set" ? (
          <ShootForm key={formKey} onReviewingChange={setReviewing} />
        ) : (
          <CompletedForm key={formKey} onSubmitted={saved} onReviewingChange={setReviewing} />
        )}
      </div>
    </Page>
  )
}
