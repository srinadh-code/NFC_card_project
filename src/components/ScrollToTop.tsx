import { useEffect } from "react"
import { useLocation } from "react-router-dom"

/**
 * Resets scroll position to the top on every route change. Without this,
 * the browser preserves scroll position across client-side navigations, so
 * landing on a new page halfway down (wherever the previous page left off)
 * is the default — this makes every navigation start at the top instead.
 */
export function ScrollToTop() {
  const { pathname } = useLocation()

  // The browser's own scroll restoration (default "auto") re-applies the
  // previous scroll offset on back/forward navigation, which races with —
  // and usually wins against — the reset below. Turning it off hands scroll
  // position entirely to this component for every navigation, including
  // back/forward.
  useEffect(() => {
    const previous = window.history.scrollRestoration
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual"
    }
    return () => {
      if ("scrollRestoration" in window.history) {
        window.history.scrollRestoration = previous
      }
    }
  }, [])

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" })
  }, [pathname])

  return null
}
