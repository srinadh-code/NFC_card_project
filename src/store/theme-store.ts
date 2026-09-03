import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { ThemeMode } from "@/types"

interface ThemeState {
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
}

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement
  const isDark =
    mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)
  root.classList.toggle("dark", isDark)
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: "light",
      setMode: (mode) => {
        applyTheme(mode)
        set({ mode })
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
