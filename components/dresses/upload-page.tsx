"use client"

import { CheckCircle2Icon, WandSparklesIcon } from "lucide-react"
import { useState } from "react"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { Product } from "@/lib/types"

import { CompletedDressForm } from "./completed-dress-form"
import { GeneratedDressForm } from "./generated-dress-form"
import { RecentDresses } from "./recent-dresses"

type Kind = "completed" | "generate"

const HELP: Record<Kind, string> = {
  completed:
    "Photos you've already finished. Drop all of them, add the price — the AI sorts them by colour.",
  generate:
    "Photos that still need the shop background. The first colour needs a front and a back; other colours just a front.",
}

/** The store owner's page: pick finished or needs-editing, then upload one dress. */
export function UploadPage() {
  const [kind, setKind] = useState<Kind>("completed")
  // Remounting the form (new key) after a save clears it without reset effects.
  const [formKey, setFormKey] = useState(0)
  const [lastSaved, setLastSaved] = useState<Product | null>(null)

  function saved(product: Product) {
    setLastSaved(product)
    setFormKey((k) => k + 1)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-4 md:p-8">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Upload a dress</h1>
          <p className="text-muted-foreground">{HELP[kind]}</p>
        </div>
        <ToggleGroup
          variant="outline"
          spacing={0}
          value={[kind]}
          onValueChange={(v) => {
            if (!v[0]) return
            setKind(v[0] as Kind)
            setFormKey((k) => k + 1)
          }}
          aria-label="Dress type"
          className="w-full sm:w-fit"
        >
          <ToggleGroupItem value="completed" className="flex-1">
            <CheckCircle2Icon />
            Completed dress
          </ToggleGroupItem>
          <ToggleGroupItem value="generate" className="flex-1">
            <WandSparklesIcon />
            Needs editing
          </ToggleGroupItem>
        </ToggleGroup>
      </header>

      {kind === "completed" ? (
        <CompletedDressForm key={formKey} onSubmitted={saved} />
      ) : (
        <GeneratedDressForm key={formKey} onSubmitted={saved} />
      )}

      <RecentDresses highlight={lastSaved?.id} />
    </main>
  )
}
