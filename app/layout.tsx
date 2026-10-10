import type { Metadata } from "next"
import { Archivo } from "next/font/google"

import { AppHeader } from "@/components/app-header"
import { Toaster } from "@/components/ui/toast"
import { TooltipProvider } from "@/components/ui/tooltip"
import { THEME_SCRIPT } from "@/lib/theme-script"

import "./globals.css"

// Variable width axis: condensed for template names, normal for everything else.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
})

export const metadata: Metadata = {
  title: "Backdrop Studio",
  description: "Collect product photos and put them into the same background with AI.",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The theme script sets the `dark` class before React hydrates, hence suppressHydrationWarning.
    <html lang="en" className={`${archivo.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <TooltipProvider>
          <Toaster>
            <AppHeader />
            {children}
          </Toaster>
        </TooltipProvider>
      </body>
    </html>
  )
}
