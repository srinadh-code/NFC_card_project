import { useLayoutEffect, useRef } from "react"

interface StaggeredEntranceOptions {
  selector: string
  staggerMs: number
  content: unknown
  enabled?: boolean
  durationMs?: number
  offsetPx?: number
}

/** Reveal one card group on entering view; unsupported browsers stay visible. */
export function useStaggeredEntrance({
  selector,
  staggerMs,
  content,
  enabled = true,
  durationMs = 500,
  offsetPx = 25,
}: StaggeredEntranceOptions) {
  const gridRef = useRef<HTMLDivElement>(null)
  const entrancePlayed = useRef(false)

  useLayoutEffect(() => {
    const grid = gridRef.current
    const initialTranslate = `0 ${offsetPx}px`
    if (
      !enabled || !grid || entrancePlayed.current || grid.contains(document.activeElement) ||
      typeof IntersectionObserver === "undefined" ||
      typeof grid.animate !== "function" ||
      typeof window.matchMedia !== "function" ||
      !window.CSS?.supports?.("translate", initialTranslate)
    ) return

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
    if (reducedMotion.matches) return

    const animations: Animation[] = []
    let observer: IntersectionObserver | undefined
    let disposed = false
    const stop = () => {
      disposed = true
      observer?.disconnect()
      animations.forEach((animation) => animation.cancel())
    }
    const handleMotionChange = () => {
      if (reducedMotion.matches) {
        entrancePlayed.current = true
        stop()
      }
    }
    const handleFocus = () => {
      // A keyboard user must never focus a CTA inside an invisible card.
      entrancePlayed.current = true
      stop()
    }

    try {
      observer = new IntersectionObserver(([entry]) => {
        if (disposed || !entry.isIntersecting || entrancePlayed.current) return
        entrancePlayed.current = true
        observer?.disconnect()
        try {
          animations.forEach((animation) => animation.play())
        } catch {
          stop()
        }
      }, { threshold: 0.1 })

      grid.querySelectorAll<HTMLElement>(selector).forEach((card, index) => {
        // Individual translate preserves the card's existing hover transform.
        const animation = card.animate([
          { opacity: 0, translate: initialTranslate },
          { opacity: 1, translate: "0 0" },
        ], { duration: durationMs, delay: index * staggerMs, easing: "ease-out", fill: "backwards" })
        animations.push(animation)
        animation.pause()
      })
      reducedMotion.addEventListener?.("change", handleMotionChange)
      grid.addEventListener("focusin", handleFocus)
      observer.observe(grid)
    } catch {
      stop()
    }

    return () => {
      stop()
      reducedMotion.removeEventListener?.("change", handleMotionChange)
      grid.removeEventListener("focusin", handleFocus)
    }
  }, [selector, staggerMs, content, enabled, durationMs, offsetPx])

  return gridRef
}
