"use client"

import { useState } from "react"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { api } from "@/lib/client"
import type { Product } from "@/lib/types"

/** Mount it to ask; stays open until the delete finishes, and on failure so she can retry. */
export function DeleteProductDialog({
  product,
  onClose,
  onDeleted,
}: {
  product: Product
  onClose: () => void
  onDeleted: () => void
}) {
  const [busy, setBusy] = useState(false)

  async function remove() {
    setBusy(true)
    try {
      await api(`/api/products/${product.id}`, { method: "DELETE" })
      toast.add({ type: "success", title: "Product deleted" })
      onDeleted()
      onClose()
    } catch (err) {
      toast.add({ type: "error", title: "Couldn't delete", description: (err as Error).message })
      setBusy(false)
    }
  }

  return (
    <AlertDialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {product.name ?? "this product"}?</AlertDialogTitle>
          <AlertDialogDescription>
            Its photos (originals and results) are removed from ImageKit too. This can&apos;t be
            undone. Products already imported into Shopify aren&apos;t affected.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button variant="destructive" onClick={remove} disabled={busy}>
            {busy && <Spinner data-icon="inline-start" />}
            Delete product
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
