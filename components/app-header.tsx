"use client"

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useTheme, type ThemePreference } from "@/lib/theme"

const NAV = [
  { href: "/", label: "Upload" },
  { href: "/dresses", label: "Dresses" },
  { href: "/settings", label: "Settings" },
] as const

const THEMES = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "System", icon: MonitorIcon },
] as const

/** Highlights the current section. Reads the path, so the layout renders it in <Suspense>. */
export function AppHeader() {
  return <AppHeaderShell pathname={usePathname()} />
}

/** The header itself; `pathname: null` (the Suspense fallback) just highlights nothing. */
export function AppHeaderShell({ pathname }: { pathname: string | null }) {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background">
      <div className="flex h-14 items-center gap-2 px-4 sm:gap-4 md:px-8">
        <Link
          href="/"
          className="font-condensed hidden shrink-0 text-lg font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:inline"
        >
          Backdrop Studio
        </Link>
        <nav aria-label="Sections" className="flex items-center gap-1">
          {NAV.map((item) => {
            const active =
              pathname !== null &&
              (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href))
            // The current section gets a cobalt rule along the header's bottom edge.
            return (
              <Button
                key={item.href}
                size="sm"
                variant="ghost"
                nativeButton={false}
                render={<Link href={item.href} aria-current={active ? "page" : undefined} />}
                className="relative aria-[current=page]:text-primary aria-[current=page]:after:absolute aria-[current=page]:after:inset-x-2.5 aria-[current=page]:after:-bottom-[18px] aria-[current=page]:after:h-0.5 aria-[current=page]:after:rounded-full aria-[current=page]:after:bg-primary"
              >
                {item.label}
              </Button>
            )
          })}
        </nav>
        <div className="ml-auto">
          <ThemeMenu />
        </div>
      </div>
    </header>
  )
}

function ThemeMenu() {
  const { theme, resolved, setTheme } = useTheme()
  // Show what's on screen — sun or moon — whichever setting got it there.
  const Current = resolved === "dark" ? MoonIcon : resolved === "light" ? SunIcon : MonitorIcon
  const label = `Theme: ${resolved ?? "system"}${theme === "system" ? " (following system)" : ""}`

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button size="icon" variant="ghost" aria-label={label} title={label} />}
      >
        <Current />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={theme}
            onValueChange={(v) => setTheme(v as ThemePreference)}
          >
            {THEMES.map(({ value, label, icon: Icon }) => (
              <DropdownMenuRadioItem key={value} value={value}>
                <Icon />
                {label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
