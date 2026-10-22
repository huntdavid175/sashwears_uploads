import { Badge } from "@/components/ui/badge"
import type { TemplateKind } from "@/lib/types"

export const KIND_LABELS: Record<TemplateKind, string> = {
  model: "On a model",
  scene: "Product scene",
}

/** Ink tag for model templates, outline for scenes. */
export function KindTag({ kind }: { kind: TemplateKind }) {
  return <Badge variant={kind === "model" ? "ink" : "outline"}>{KIND_LABELS[kind]}</Badge>
}
