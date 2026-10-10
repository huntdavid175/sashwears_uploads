"use client"

import { DownloadIcon, PlusIcon } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { FieldError } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { toast } from "@/components/ui/toast"
import { exportToShopify, useProducts } from "@/lib/client"
import type { Product } from "@/lib/types"

import { DressCard } from "./dress-card"

export function DressList() {
  const { products, error, refresh } = useProducts()
  const [exporting, setExporting] = useState(false)

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Dresses</h1>
          <p className="text-muted-foreground">Click a dress to see all its photos.</p>
        </div>
        <Button onClick={() => setExporting(true)} disabled={!products?.length}>
          <DownloadIcon data-icon="inline-start" />
          Export to Shopify
        </Button>
      </header>

      {error && !products ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load dresses</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : products === null ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="aspect-[3/5]" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyTitle>No dresses yet</EmptyTitle>
            <EmptyDescription>Submitted dresses and their photos show up here.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button nativeButton={false} render={<Link href="/" />}>
              <PlusIcon data-icon="inline-start" />
              New dress
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <DressCard key={p.id} product={p} />
          ))}
        </div>
      )}

      <ExportDialog
        open={exporting}
        onOpenChange={setExporting}
        products={products ?? []}
        onExported={refresh}
      />
    </main>
  )
}

function ExportDialog({
  open,
  onOpenChange,
  products,
  onExported,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  products: Product[]
  onExported: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open && (
          <ExportForm
            products={products}
            onDone={() => {
              onExported()
              onOpenChange(false)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function ExportForm({ products, onDone }: { products: Product[]; onDone: () => void }) {
  const ready = products.filter((p) => p.status === "ready" && p.name)
  const fresh = ready.filter((p) => !p.exportedAt)
  const [which, setWhich] = useState<"new" | "all">(fresh.length ? "new" : "all")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const chosen = which === "new" ? fresh : ready
  const waiting = products.length - ready.length

  async function run() {
    setBusy(true)
    setError(null)
    try {
      await exportToShopify(chosen.map((p) => p.id))
      toast.add({
        type: "success",
        title: `Exported ${chosen.length} dress${chosen.length === 1 ? "" : "es"}`,
        description: "In Shopify: Products → Import, then choose this file.",
      })
      onDone()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>Export to Shopify</DialogTitle>
        <DialogDescription>
          Downloads a product CSV: one variant per colour and size with price and stock, and all
          photos. Dresses import as drafts so you can check them before publishing.
        </DialogDescription>
      </DialogHeader>

      <ToggleGroup
        variant="outline"
        spacing={0}
        value={[which]}
        onValueChange={(v) => v[0] && setWhich(v[0] as "new" | "all")}
      >
        <ToggleGroupItem value="new">Not exported yet ({fresh.length})</ToggleGroupItem>
        <ToggleGroupItem value="all">All ready ({ready.length})</ToggleGroupItem>
      </ToggleGroup>

      {chosen.length > 0 ? (
        <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto text-sm">
          {chosen.map((p) => (
            <li key={p.id} className="truncate">
              {p.name}
              <span className="text-muted-foreground">
                {" "}
                · {p.colors.length} colour{p.colors.length === 1 ? "" : "s"} × {p.sizes.length} size
                {p.sizes.length === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nothing to export here.</p>
      )}
      {waiting > 0 && (
        <p className="text-sm text-muted-foreground">
          {waiting} dress{waiting === 1 ? " isn't" : "es aren't"} ready yet (still generating or a
          photo failed) and {waiting === 1 ? "is" : "are"} left out.
        </p>
      )}
      {error && <FieldError>{error}</FieldError>}

      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button onClick={run} disabled={busy || chosen.length === 0}>
          {busy ? <Spinner data-icon="inline-start" /> : <DownloadIcon data-icon="inline-start" />}
          Download CSV
        </Button>
      </DialogFooter>
    </div>
  )
}
