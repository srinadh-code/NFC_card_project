import { useLayoutEffect, useRef } from "react"

function parseCount(value: string) {
  const match = value.trim().match(/^(\d+(?:,\d{3})*(?:\.\d+)?)\s*([KMB])?\s*([+%])?$/i)
  if (!match) return null

  const unit = match[2]?.toUpperCase()
  const multiplier = unit === "B" ? 1e9 : unit === "M" ? 1e6 : unit === "K" ? 1e3 : 1
  const target = Number(match[1].replaceAll(",", "")) * multiplier
  const precision = match[1].split(".")[1]?.length ?? 0
  return Number.isFinite(target) && target > 0
    ? { target, suffix: match[3] ?? "", precision, abbreviated: Boolean(unit) }
    : null
}

function formatCount(value: number, parsed: NonNullable<ReturnType<typeof parseCount>>, compact: boolean) {
  const { suffix, precision, target, abbreviated } = parsed
  if (suffix === "%" || (!compact && !abbreviated)) {
    const factor = 10 ** precision
    // Keep whole-number totals discrete, including the zero-to-one counter.
    const count = precision === 0 && target < 10 ? Math.round(value) : Math.floor(value * factor) / factor
    return `${count}${suffix}`
  }

  const scale = value >= 1e9 ? 1e9 : value >= 1e6 ? 1e6 : value >= 1e3 ? 1e3 : 1
  // Truncate intermediate values so rounding never displays the target early.
  const factor = 10 ** precision
  const count = scale === 1 ? Math.floor(value * factor) / factor : Math.floor(value / scale * 10) / 10
  const unit = scale === 1e9 ? "B" : scale === 1e6 ? "M" : scale === 1e3 ? "K" : ""
  return `${count}${unit}${suffix}`
}

/** One viewport trigger and animation loop for a CMS-driven statistics group. */
export function useStatCounters(content: unknown, { compact = true }: { compact?: boolean } = {}) {
  const gridRef = useRef<HTMLDivElement>(null)
  const played = useRef(false)

  useLayoutEffect(() => {
    const grid = gridRef.current
    if (!grid) return

    const counters = Array.from(grid.querySelectorAll<HTMLElement>("[data-stat-value]")).map((element) => {
      const finalValue = element.dataset.statValue ?? ""
      return { element, finalValue, parsed: parseCount(finalValue) }
    })
    const showFinalValues = () => counters.forEach(({ element, finalValue }) => {
      element.textContent = finalValue
    })

    showFinalValues()
    if (
      played.current || !counters.some(({ parsed }) => parsed) ||
      typeof IntersectionObserver === "undefined" ||
      typeof window.requestAnimationFrame !== "function" ||
      typeof window.matchMedia !== "function"
    ) return

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
    if (reducedMotion.matches) {
      played.current = true
      return
    }

    let frame = 0
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || played.current) return
      played.current = true
      observer.disconnect()
      const startedAt = performance.now()

      const tick = (now: number) => {
        let running = false
        counters.forEach(({ element, finalValue, parsed }, index) => {
          if (!parsed) return
          const progress = Math.min(Math.max((now - startedAt - index * 150) / 2000, 0), 1)
          const eased = 1 - (1 - progress) ** 3
          const text = progress === 1 ? finalValue : formatCount(parsed.target * eased, parsed, compact)
          if (element.textContent !== text) element.textContent = text
          if (progress < 1) running = true
        })
        if (running) frame = window.requestAnimationFrame(tick)
      }
      frame = window.requestAnimationFrame(tick)
    }, { threshold: 0.15 })

    const handleMotionChange = () => {
      if (!reducedMotion.matches) return
      played.current = true
      observer.disconnect()
      window.cancelAnimationFrame(frame)
      showFinalValues()
    }

    // Prepare before paint, keeping the original CMS value for all fallbacks.
    counters.forEach(({ element, parsed }) => {
      if (parsed) element.textContent = formatCount(0, parsed, compact)
    })
    reducedMotion.addEventListener?.("change", handleMotionChange)
    observer.observe(grid)

    return () => {
      observer.disconnect()
      window.cancelAnimationFrame(frame)
      reducedMotion.removeEventListener?.("change", handleMotionChange)
    }
  }, [content, compact])

  return gridRef
}
