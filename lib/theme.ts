"use client"

import { useCallback, useEffect, useSyncExternalStore } from "react"

import { THEME_KEY } from "./theme-script"

export type ThemePreference = "light" | "dark" | "system"

const CHANGE_EVENT = "themechange"
const DARK_QUERY = "(prefers-color-scheme: dark)"

function read(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_KEY)
    return value === "light" || value === "dark" ? value : "system"
  } catch {
    return "system"
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange)
  window.addEventListener("storage", onChange) // other tabs
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange)
    window.removeEventListener("storage", onChange)
  }
}

function apply(preference: ThemePreference) {
  const dark = preference === "dark" || (preference === "system" && matchMedia(DARK_QUERY).matches)
  document.documentElement.classList.toggle("dark", dark)
  document.documentElement.style.colorScheme = dark ? "dark" : "light"
}

/** Light / dark / follow the system. Stored per browser; THEME_SCRIPT applies it before paint. */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, read, () => "system" as const)

  useEffect(() => {
    apply(theme)
    if (theme !== "system") return
    const query = matchMedia(DARK_QUERY)
    const follow = () => apply("system")
    query.addEventListener("change", follow)
    return () => query.removeEventListener("change", follow)
  }, [theme])

  const setTheme = useCallback((next: ThemePreference) => {
    try {
      if (next === "system") localStorage.removeItem(THEME_KEY)
      else localStorage.setItem(THEME_KEY, next)
    } catch {
      // Storage blocked: the choice still applies for this page view.
      apply(next)
    }
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }, [])

  return { theme, setTheme }
}
