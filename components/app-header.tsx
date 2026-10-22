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
  { href: "/products", label: "Products" },
  { href: "/templates", label: "Templates" },
]

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
    <header className="sticky top-0 z-10 border-b border-border bg-card">
      <div className="mx-auto flex h-12 max-w-7xl items-center gap-3 px-4 md:px-6">
        <Link
          href="/"
          className="font-condensed shrink-0 text-xl leading-none font-extrabold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Backdrop Studio
        </Link>
        <span className="hidden text-xs text-muted-foreground sm:inline">
          Product photos, shop-ready
        </span>
        <div className="ml-auto">
          <ThemeMenu />
        </div>
      </div>
      {/* Section tabs: the current one is red with a red rule along the header's edge. */}
      <nav aria-label="Sections" className="mx-auto flex max-w-7xl px-2 md:px-4">
        {NAV.map((item) => {
          const active =
            pathname !== null &&
            (item.href === "/"
              ? pathname === "/" || pathname.startsWith("/shoots")
              : pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="relative px-3 py-2.5 text-sm font-medium text-foreground outline-none hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=page]:font-bold aria-[current=page]:text-primary aria-[current=page]:after:absolute aria-[current=page]:after:inset-x-3 aria-[current=page]:after:-bottom-px aria-[current=page]:after:h-0.5 aria-[current=page]:after:bg-primary"
            >
              {item.label}
            </Link>
          )
        })}
      </nav>
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
