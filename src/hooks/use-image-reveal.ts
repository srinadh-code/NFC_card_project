import { useLayoutEffect, useRef } from "react"

/** The About image entrance, scoped to one image or its existing frame. */
export function useImageReveal<T extends HTMLElement = HTMLImageElement>(source?: string | null, enabled = true) {
  const ref = useRef<T>(null)
  const played = useRef(false)

  useLayoutEffect(() => {
    const element = ref.current
    if (
      !enabled || !source || !element || played.current ||
      typeof IntersectionObserver === "undefined" ||
      typeof element.animate !== "function" ||
      typeof window.matchMedia !== "function"
    ) return

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
    if (reducedMotion.matches) return

    const images = element instanceof HTMLImageElement
      ? [element]
      : Array.from(element.querySelectorAll("img"))
    // A cached failure has no future load event; leave its existing fallback visible.
    if (images.some((image) => image.complete && image.naturalWidth === 0)) return
    const animations: Animation[] = []
    let observer: IntersectionObserver | undefined
    let inView = false
    let disposed = false

    function stop() {
      disposed = true
      observer?.disconnect()
      animations.forEach((animation) => animation.cancel())
      images.forEach((image) => {
        image.removeEventListener("load", reveal)
        image.removeEventListener("error", stop)
      })
      reducedMotion.removeEventListener?.("change", handleMotionChange)
    }

    function reveal() {
      if (
        disposed || !inView || played.current ||
        images.some((image) => !image.complete || image.naturalWidth === 0)
      ) return
      played.current = true
      observer?.disconnect()
      try {
        animations.forEach((animation) => animation.play())
      } catch {
        stop()
      }
    }

    function handleMotionChange() {
      if (!reducedMotion.matches) return
      played.current = true
      stop()
    }

    try {
      // Add to existing transforms so floats, rotations and hover effects keep
      // running. Opacity has its own effect to preserve translucent artwork.
      const timing: KeyframeAnimationOptions = { duration: 800, easing: "ease-out", fill: "backwards" }
      const opacity = element.animate([
        { opacity: 0 },
        { opacity: getComputedStyle(element).opacity },
      ], timing)
      animations.push(opacity)
      opacity.pause()

      const motion = element.animate([
        { transform: "translateY(20px) scale(0.95)" },
        { transform: "translateY(0px) scale(1)" },
      ], { ...timing, composite: "add" })
      animations.push(motion)
      motion.pause()
      if ((motion.effect as KeyframeEffect | null)?.composite !== "add") {
        stop()
        return
      }

      observer = new IntersectionObserver(([entry]) => {
        inView = entry.isIntersecting
        reveal()
      }, { threshold: 0.1 })
      images.forEach((image) => {
        image.addEventListener("load", reveal)
        image.addEventListener("error", stop)
      })
      reducedMotion.addEventListener?.("change", handleMotionChange)
      observer.observe(element)
    } catch {
      stop()
    }

    return stop
  }, [source, enabled])

  return ref
}
