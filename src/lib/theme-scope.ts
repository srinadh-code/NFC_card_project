import { createContext, useContext } from "react"

// React context follows portaled menus/dialogs without changing the body theme.
export const PublicThemeContext = createContext(false)

export function usePublicThemeClass() {
  return useContext(PublicThemeContext) ? "public-theme" : undefined
}
