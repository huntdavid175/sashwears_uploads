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
  { href: "/", label: "Uploads" },
  { href: "/studio", label: "Studio" },
] as const

const THEMES = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "System", icon: MonitorIcon },
] as const

export function AppHeader() {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background">
      <div className="flex h-14 items-center gap-4 px-4 md:px-8">
        <Link
          href="/"
          className="font-condensed shrink-0 text-lg font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Backdrop Studio
        </Link>
        <nav aria-label="Sections" className="flex items-center gap-1">
          {NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
            return (
              <Button
                key={item.href}
                size="sm"
                variant={active ? "secondary" : "ghost"}
                nativeButton={false}
                render={<Link href={item.href} aria-current={active ? "page" : undefined} />}
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
  const { theme, setTheme } = useTheme()
  const Current = THEMES.find((t) => t.value === theme)?.icon ?? MonitorIcon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="icon" variant="ghost" aria-label="Theme" />}>
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
