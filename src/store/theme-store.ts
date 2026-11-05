import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { ThemeMode } from "@/types"

interface ThemeState {
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
  toggle: () => void
}

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement
  const isDark =
    mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)
  root.classList.toggle("dark", isDark)
  root.style.colorScheme = isDark ? "dark" : "light"
}

export function isDarkThemeMode(mode: ThemeMode) {
  return mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: "light",
      setMode: (mode) => {
        applyTheme(mode)
        set({ mode })
      },
      toggle: () => {
        const next = isDarkThemeMode(get().mode) ? "light" : "dark"
        applyTheme(next)
        set({ mode: next })
      },
    }),
    {
      name: "taplink-theme",
      onRehydrateStorage: () => (state) => {
        applyTheme(state?.mode ?? "light")
      },
    },
  ),
)

// Keep the applied theme in sync with the OS setting while in "system" mode.
if (typeof window !== "undefined") {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (useThemeStore.getState().mode === "system") applyTheme("system")
  })
  applyTheme(useThemeStore.getState().mode)
}
