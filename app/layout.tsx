import type { Metadata } from "next"
import { Archivo } from "next/font/google"

import { Toaster } from "@/components/ui/toast"
import { TooltipProvider } from "@/components/ui/tooltip"

import "./globals.css"

// Variable width axis: condensed for template names, normal for everything else.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
})

export const metadata: Metadata = {
  title: "Backdrop Studio",
  description: "Put every product photo into the same background, using reusable templates.",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${archivo.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <TooltipProvider>
          <Toaster>{children}</Toaster>
        </TooltipProvider>
      </body>
    </html>
  )
}
